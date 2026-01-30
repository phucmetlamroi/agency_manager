from http.server import BaseHTTPRequestHandler
import os
import json
import math
import pg8000.native
import ssl

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # 1. Security Check
        auth_header = self.headers.get('Authorization')
        cron_secret = os.environ.get('CRON_SECRET')
        
        # Determine if we are in dev mode (allow bypass if secret not set, or STRICT if set)
        if cron_secret and auth_header != f"Bearer {cron_secret}":
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b"Unauthorized")
            return

        try:
            # 2. Database Connection
            # Parse DATABASE_URL manually or use env vars if provided separately
            # Neon usually provides a full Postgres URL. pg8000 prefers broken down params.
            # Ideally, we rely on standard PG* env vars if Vercel injects them, 
            # OR parse the string. For safety with Neon, let's assume standard PGHOST, PGUSER, etc. are set,
            # or we parse the URL. Vercel usually sets POSTGRES_URL.
            
            # Simple URL parser for Vercel's POSTGRES_URL
            db_url = os.environ.get('POSTGRES_URL') or os.environ.get('DATABASE_URL')
            if not db_url:
                raise Exception("DATABASE_URL not found")

            # Basic parsing (Robust parsing would use urllib.parse)
            from urllib.parse import urlparse
            result = urlparse(db_url)
            
            username = result.username
            password = result.password
            host = result.hostname
            port = result.port or 5432
            database = result.path[1:] # remove leading /

            ssl_context = ssl.create_default_context()
            
            # Connect via TCP (not WebSocket context needed for pg8000 native unless specified)
            con = pg8000.native.Connection(
                user=username,
                password=password,
                host=host,
                port=port,
                database=database,
                ssl_context=ssl_context
            )

            # 3. Calculation Logic (Logarithmic Scoring)
            # Query: Revenue per Client + Feedback stats
            query = """
                SELECT c.id, 
                       COALESCE(SUM(t.value), 0) as revenue,
                       (SELECT COUNT(*) FROM "Feedback" f 
                        JOIN "Project" p2 ON f."projectId" = p2.id 
                        WHERE p2."clientId" = c.id AND f.type = 'CLIENT') as issues
                FROM "Client" c
                LEFT JOIN "Project" p ON c.id = p."clientId"
                LEFT JOIN "Task" t ON p.id = t."projectId" AND t.status = 'Hoàn tất'
                GROUP BY c.id
            """
            
            rows = con.run(query)
            updates = []
            
            for row in rows:
                client_id = row[0]
                revenue = float(row[1])
                issues = int(row[2])
                
                # Formula: Score = log(Revenue + 1) * 10 - (Issues * 5)
                # Normalized to 0-100 range roughly
                
                if revenue <= 0:
                    score = 0
                else:
                    score = (math.log(revenue + 1, 10) * 20) - (issues * 5)
                    score = max(0, min(100, score)) # Clamp 0-100
                    
                updates.append((score, client_id))
            
            # 4. Batch Update
            for score, cid in updates:
                con.run("UPDATE \"Client\" SET \"aiScore\" = :s WHERE id = :id", s=score, id=cid)
                
            con.close()
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success", "updated": len(updates)}).encode())

        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode())

from http.server import BaseHTTPRequestHandler
import os
import json
import math
# pg8000 is still required. 
# Note: Vercel needs dependencies installed. It looks at requirements.txt in root.
import pg8000.native
import ssl
from urllib.parse import urlparse

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # 1. Security Check
        auth_header = self.headers.get('Authorization')
        cron_secret = os.environ.get('CRON_SECRET')
        
        if cron_secret and auth_header != f"Bearer {cron_secret}":
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b"Unauthorized")
            return

        try:
            # 2. Database Connection
            db_url = os.environ.get('POSTGRES_URL') or os.environ.get('DATABASE_URL')
            if not db_url:
                raise Exception("DATABASE_URL not found")

            result = urlparse(db_url)
            
            username = result.username
            password = result.password
            host = result.hostname
            port = result.port or 5432
            database = result.path[1:]

            ssl_context = ssl.create_default_context()
            
            con = pg8000.native.Connection(
                user=username,
                password=password,
                host=host,
                port=port,
                database=database,
                ssl_context=ssl_context
            )

            # 3. Logic
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
                
                if revenue <= 0:
                    score = 0
                else:
                    score = (math.log(revenue + 1, 10) * 20) - (issues * 5)
                    score = max(0, min(100, score)) 
                    
                updates.append((score, client_id))
            
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

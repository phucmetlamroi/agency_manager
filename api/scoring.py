from http.server import BaseHTTPRequestHandler
import os
import json
import math
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
            
            ssl_context = ssl.create_default_context()
            
            con = pg8000.native.Connection(
                user=result.username,
                password=result.password,
                host=result.hostname,
                port=result.port or 5432,
                database=result.path[1:],
                ssl_context=ssl_context
            )

            # 3. Logic - Advanced AI Scoring
            # Fetch: ID, Revenue, Revisions (Client), Total Tasks, InputQuality, PaymentRating
            
            query = """
                SELECT 
                    c.id, 
                    COALESCE(SUM(t.value), 0) as revenue,
                    (SELECT COUNT(*) FROM "Feedback" f WHERE f."taskId" IN (SELECT id FROM "Task" WHERE "clientId" = c.id) AND f.type = 'CLIENT') as client_revisions,
                    (SELECT COUNT(*) FROM "Task" t2 WHERE t2."clientId" = c.id AND t2.status = 'Hoàn tất') as total_tasks,
                    c."inputQuality",
                    c."paymentRating"
                FROM "Client" c
                LEFT JOIN "Task" t ON c.id = t."clientId" AND t.status = 'Hoàn tất'
                GROUP BY c.id, c."inputQuality", c."paymentRating"
            """
            
            rows = con.run(query)
            updates = []
            
            for row in rows:
                client_id = row[0]
                revenue = float(row[1])
                revisions = int(row[2])
                total_tasks = int(row[3])
                input_quality = int(row[4] or 3)
                payment_rating = int(row[5] or 3)
                
                # --- ALGORITHM ---
                
                # 1. Friction Score (0 to 1)
                # If total_tasks is 0, friction is 0.
                friction = 0.0
                if total_tasks > 0:
                    friction = revisions / total_tasks
                
                # 2. Value Score (0 to 100)
                # Logarithmic scale for revenue. Assuming 100M VND is 100 points roughly.
                # log10(100,000,000) = 8. 
                # Score = (log10(Rev) - 5) * 33   (log10(1M) = 6 -> Score 33. log10(10M) = 7 -> Score 66)
                value_score = 0
                if revenue > 1000000:
                    value_score = (math.log10(revenue) - 6) * 40
                    value_score = max(0, min(100, value_score))
                
                # 3. Quality & Payment (0 to 100)
                # Map 1-5 to 0-100. (5->100, 3->60, 1->20)
                quality_score = input_quality * 20
                payment_score = payment_rating * 20
                
                # 4. Final Weighted Score
                # Weights: Value 50%, Friction 20% (Penalty), Quality 15%, Payment 15%
                friction_penalty = friction * 100 # Friction > 1 means heavily penalized
                final_score = (value_score * 0.5) - (friction_penalty * 0.2) + (quality_score * 0.15) + (payment_score * 0.15)
                final_score = max(0, min(100, final_score))
                
                # 5. Tier Classification
                tier = 'standard'
                if final_score >= 80 and revenue > 50000000:
                    tier = 'DIAMOND'
                elif final_score >= 60 and revenue > 20000000:
                    tier = 'GOLD'
                elif final_score >= 40:
                    tier = 'SILVER'
                
                # Override: Warning Trigger
                if friction > 0.5 or payment_rating <= 1:
                    tier = 'WARNING'
                
                updates.append((final_score, friction, tier, client_id))
            
            # 4. Batch Update
            for score, fric, tier, cid in updates:
                con.run(
                    "UPDATE \"Client\" SET \"aiScore\" = :s, \"frictionIndex\" = :f, \"tier\" = :t::\"ClientTier\" WHERE id = :id", 
                    s=score, f=fric, t=tier, id=cid
                )
                
            con.close()
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success", "updates": len(updates)}).encode())

        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode())

from http.server import BaseHTTPRequestHandler
import json
import os
import subprocess
import urllib.parse
from urllib.parse import parse_qs

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # 1. Parse query parameters
        parsed_path = urllib.parse.urlparse(self.path)
        params = parse_qs(parsed_path.query)
        
        video_url = params.get('url', [None])[0]
        format_type = params.get('formatType', ['best'])[0]
        
        if not video_url:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'Missing url parameter')
            return

        # 2. Setup yt-dlp command
        # We use yt-dlp as a standalone binary if possible, 
        # or call it via python module if installed
        
        # On Vercel, we might need to use a specific location or rely on pip install
        # For this implementation, we assume yt-dlp is available in the environment
        # as it is a common way to handle this in serverless.
        
        extension = "mp3" if format_type == "audio" else "mp4"
        ydl_opts = [
            "yt-dlp",
            "-o", "-", # Output to stdout
            "--no-playlist",
            "--no-warnings",
            "--no-check-certificate",
            "--format", "bestaudio" if format_type == "audio" else "best[ext=mp4]/best",
        ]
        
        if format_type == "audio":
            ydl_opts.extend(["--extract-audio", "--audio-format", "mp3"])

        ydl_opts.append(video_url)

        try:
            # 3. Get Metadata first for filename
            meta_cmd = ["yt-dlp", "--get-title", "--no-playlist", video_url]
            title = "video"
            try:
                title = subprocess.check_output(meta_cmd, stderr=subprocess.STDOUT).decode('utf-8').strip()
                # Clean title
                title = "".join([c for c in title if c.isalnum() or c in (" ", "-", "_")]).strip()
            except:
                pass

            # 4. Stream the download
            self.send_response(200)
            self.send_header('Content-Type', 'audio/mpeg' if format_type == 'audio' else 'video/mp4')
            self.send_header('Content-Disposition', f'attachment; filename="{title}.{extension}"')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()

            # Execute yt-dlp and pipe stdout to response
            process = subprocess.Popen(ydl_opts, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            
            while True:
                chunk = process.stdout.read(1024 * 64) # 64KB chunks
                if not chunk:
                    break
                self.wfile.write(chunk)
            
            process.stdout.close()
            process.wait()

        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f"Error: {str(e)}".encode())

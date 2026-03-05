from http.server import BaseHTTPRequestHandler
import json
import os
import urllib.parse
from urllib.parse import parse_qs
import yt_dlp
import re

def sanitize_filename(name):
    return re.sub(r'(?u)[^-\w. ]', '', name).strip()

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        params = parse_qs(parsed_path.query)
        
        video_url = params.get('url', [None])[0]
        format_type = params.get('formatType', ['best'])[0]
        
        if not video_url:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Error: Missing url parameter")
            return

        # Simple placeholder for filename
        final_filename = "download"
        extension = "mp3" if format_type == "audio" else "mp4"

        ydl_opts = {
            'format': 'bestaudio/best' if format_type == 'audio' else 'best[ext=mp4]/best',
            'outtmpl': '-', # Stream to stdout
            'quiet': True,
            'no_warnings': True,
            'nocheckcertificate': True,
            'noplaylist': True,
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        }

        if format_type == 'audio':
            ydl_opts.update({
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
            })

        try:
            # 1. Extract metadata safely
            with yt_dlp.YoutubeDL({'quiet': True, 'noplaylist': True}) as ydl:
                info = ydl.extract_info(video_url, download=False)
                raw_title = info.get('title', 'video')
                final_filename = sanitize_filename(raw_title)

            # 2. Send headers early
            self.send_response(200)
            self.send_header('Content-Type', 'audio/mpeg' if format_type == 'audio' else 'video/mp4')
            self.send_header('Content-Disposition', f'attachment; filename="{final_filename}.{extension}"')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()

            # 3. Stream data
            # Since yt-dlp library doesn't easily return a stream for stdout in memory without complex wrappers,
            # we fallback to a more robust subprocess call but with the extracted title
            
            cmd = [
                "yt-dlp",
                "-o", "-",
                "--no-playlist",
                "--quiet",
                "--no-warnings",
                "--format", ydl_opts['format'],
                video_url
            ]
            
            if format_type == 'audio':
                cmd.extend(["--extract-audio", "--audio-format", "mp3"])

            import subprocess
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            
            # Use buffer to send data
            try:
                for chunk in iter(lambda: process.stdout.read(128 * 1024), b''):
                    self.wfile.write(chunk)
            except (ConnectionResetError, BrokenPipeError):
                # Client disconnected
                pass
            finally:
                process.terminate()
                process.wait()

        except Exception as e:
            # If we already sent headers (200), we can't change to 500
            # Just log it or write to stream if possible
            if not self.wfile.closed:
                try: 
                    # If this happens before headers, send 500
                    self.send_response(500)
                    self.send_header('Content-type', 'text/plain')
                    self.end_headers()
                    self.wfile.write(f"Server Error: {str(e)}".encode())
                except:
                    pass

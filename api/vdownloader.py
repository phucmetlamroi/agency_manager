import urllib.parse
from urllib.parse import parse_qs
import yt_dlp
import re
import os
import subprocess

def sanitize_filename(name):
    return re.sub(r'(?u)[^-\w. ]', '', name).strip()

import requests

def get_video_id(url):
    # Quick regex to extract video ID
    match = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11})", url)
    return match.group(1) if match else None

def get_video_title_via_api(video_id):
    api_key = os.environ.get('YOUTUBE_API_KEY')
    if not api_key or not video_id:
        return None
    try:
        url = f"https://www.googleapis.com/youtube/v3/videos?id={video_id}&key={api_key}&part=snippet"
        resp = requests.get(url, timeout=5)
        data = resp.json()
        if data.get('items'):
            return data['items'][0]['snippet']['title']
    except:
        pass
    return None

def get_cookie_path():
    cookies_data = os.environ.get('YOUTUBE_COOKIES')
    if cookies_data:
        path = '/tmp/youtube_cookies.txt'
        with open(path, 'w') as f:
            f.write(cookies_data)
        return path
    return None

from http.server import BaseHTTPRequestHandler
import json

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        params = parse_qs(parsed_path.query)
        
        is_diagnostic = params.get('diagnostic', ['false'])[0] == 'true'
        
        # 0. Diagnostic Mode
        if is_diagnostic:
            try:
                import subprocess
                ffmpeg_v = "Not Found"
                try:
                    ffmpeg_v = subprocess.check_output(["ffmpeg", "-version"]).decode().split('\n')[0]
                except:
                    # Try to find static_ffmpeg if installed
                    try:
                        from static_ffmpeg import run
                        ffmpeg_v = "static_ffmpeg available"
                    except: pass

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                diag = {
                    "ffmpeg": ffmpeg_v,
                    "python": os.sys.version,
                    "env": dict(os.environ),
                    "cwd": os.getcwd()
                }
                self.wfile.write(json.dumps(diag, indent=2).encode())
                return
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode())
                return

        video_url = params.get('url', [None])[0]
        format_type = params.get('formatType', ['best'])[0]
        
        if not video_url:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Error: Missing url parameter")
            return

        cookie_path = get_cookie_path()
        final_filename = "download"
        extension = "mp3" if format_type == "audio" else "mp4"

        # Try to find ffmpeg path for yt-dlp
        ffmpeg_path = None
        try:
            import subprocess
            ffmpeg_path = subprocess.check_output(["which", "ffmpeg"]).decode().strip()
        except:
            # Fallback to static_ffmpeg context
            try:
                from static_ffmpeg import run
                # In some envs, we might need to manually set it
                pass
            except: pass

        # Common options
        common_ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'nocheckcertificate': True,
            'noplaylist': True,
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'extractor_args': {
                'youtube': {
                    'player_client': ['android', 'ios', 'web_creator', 'mweb', 'tv'],
                }
            },
        }

        if cookie_path:
            common_ydl_opts['cookiefile'] = cookie_path

        # Enhanced format selection: 22(720p mp4) and 18(360p mp4) are safe single-file fallbacks
        if format_type == 'audio':
            stream_format = 'bestaudio/best'
        else:
            stream_format = '22/18/best[vcodec!=none][acodec!=none]/best'

        try:
            # 1. Extract metadata
            video_id = get_video_id(video_url)
            api_title = get_video_title_via_api(video_id)
            
            if api_title:
                final_filename = sanitize_filename(api_title)
            else:
                with yt_dlp.YoutubeDL(common_ydl_opts) as ydl:
                    info = ydl.extract_info(video_url, download=False)
                    raw_title = info.get('title', 'video')
                    final_filename = sanitize_filename(raw_title)

            # 2. Send headers
            self.send_response(200)
            self.send_header('Content-Type', 'audio/mpeg' if format_type == 'audio' else 'video/mp4')
            self.send_header('Content-Disposition', f'attachment; filename="{final_filename}.{extension}"')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()

            # 3. Stream data using subprocess for maximum stability
            cmd = [
                "yt-dlp",
                "-o", "-",
                "--no-playlist",
                "--quiet",
                "--no-warnings",
                "--no-check-certificate",
                "--format", stream_format,
                "--extractor-args", "youtube:player_client=android,ios,web_creator,mweb,tv",
                video_url
            ]
            
            if cookie_path:
                cmd.extend(["--cookies", cookie_path])
            
            if format_type == 'audio':
                cmd.extend(["--extract-audio", "--audio-format", "mp3"])

            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            
            try:
                for chunk in iter(lambda: process.stdout.read(128 * 1024), b''):
                    self.wfile.write(chunk)
            except (ConnectionResetError, BrokenPipeError):
                pass
            finally:
                process.terminate()
                process.wait()

        except Exception as e:
            if not getattr(self, 'wfile_closed', False):
                try: 
                    self.send_response(500)
                    self.send_header('Content-type', 'text/plain')
                    self.end_headers()
                    self.wfile.write(f"Server Error: {str(e)}".encode())
                except: pass

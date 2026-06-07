import sys
import subprocess
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class RestartHandler(FileSystemEventHandler):
    def __init__(self, command):
        self.command = command
        self.process = None
        self.start_process()

    def start_process(self):
        if self.process:
            self.process.terminate()
        self.process = subprocess.Popen(self.command, shell=True)

    def on_modified(self, event):
        if event.src_path.endswith('.py'):
            print(f"Cambio detectado en {event.src_path}. Reiniciando...")
            self.start_process()

if __name__ == "__main__":
    # Cambia "python main.py" por el comando que usas para lanzar la app
    command = "python main.py"
    event_handler = RestartHandler(command)
    observer = Observer()
    observer.schedule(event_handler, path='.', recursive=True)
    observer.start()
    print("Observando cambios en archivos .py. Presiona Ctrl+C para detener.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        if event_handler.process:
            event_handler.process.terminate()
    observer.join()
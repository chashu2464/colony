import fcntl
import time
import sys
import os
import subprocess

def acquire_lock(lock_file, timeout=5):
    """
    Acquires an exclusive lock on lock_file with a specified timeout.
    Returns the file descriptor if successful, otherwise None.
    """
    # Ensure directory exists
    os.makedirs(os.path.dirname(lock_file), exist_ok=True)
    
    start_time = time.time()
    fd = os.open(lock_file, os.O_RDWR | os.O_CREAT, 0o666)
    
    while True:
        try:
            # Try to acquire an exclusive lock without blocking
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return fd
        except (IOError, BlockingIOError):
            if time.time() - start_time > timeout:
                os.close(fd)
                return None
            time.sleep(0.1)

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 flock.py <lockfile> <command...>")
        sys.exit(1)

    lock_file = sys.argv[1]
    command = sys.argv[2:]

    fd = acquire_lock(lock_file)
    if fd is None:
        print(f"Error: Could not acquire lock on {lock_file} after 5 seconds", file=sys.stderr)
        sys.exit(3)

    try:
        # Run the command
        process = subprocess.Popen(command)
        process.wait()
        sys.exit(process.returncode)
    finally:
        # Release the lock
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)

if __name__ == "__main__":
    main()

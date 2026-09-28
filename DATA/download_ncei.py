import os
import sys
import time
import urllib.request
import urllib.error
from urllib.error import HTTPError

# Add parent directory to path so we can import from skyguard_backend
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from skyguard_backend.database import INITIAL_STATIONS

YEAR = "2023"
CSV_DIR = os.path.join(os.path.dirname(__file__), "csv")
os.makedirs(CSV_DIR, exist_ok=True)

print(f"Downloading NCEI CSV data for {len(INITIAL_STATIONS)} stations (Year: {YEAR})...")

success_count = 0
fail_count = 0

for station in INITIAL_STATIONS:
    st_id = station["station_id"]
    st_name = station["name"]
    
    # NCEI global hourly access URL pattern
    url = f"https://www.ncei.noaa.gov/data/global-hourly/access/{YEAR}/{st_id}.csv"
    
    # Save the file with the station name for easier readability by the parser
    # We will use the format expected by the NOAAISDParser: <name>.csv or just <st_id>.csv
    # The parser handles <st_id>.csv automatically if it doesn't match the name.
    safe_name = st_name.replace("/", "_").replace("\\", "_")
    dest_path = os.path.join(CSV_DIR, f"{safe_name}.csv")
    
    print(f"Fetching {st_id} ({st_name})...", end=" ", flush=True)
    
    try:
        urllib.request.urlretrieve(url, dest_path)
        print("OK")
        success_count += 1
    except HTTPError as e:
        print(f"FAILED (HTTP {e.code})")
        fail_count += 1
    except Exception as e:
        print(f"FAILED ({e})")
        fail_count += 1
        
    # Be polite to the NCEI server
    time.sleep(0.5)

print("\nDownload Summary:")
print(f"Successfully downloaded: {success_count}")
print(f"Failed: {fail_count}")

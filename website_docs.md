Vera C. Rubin Observatory Observations Submitted to the Minor Planet Center
This page contains exports of the observations taken by the Vera C. Rubin Observatory (observatory code X05) that were submitted to the Minor Planet Center.

These files are generated from the Asteroid Institute BigQuery replica of the MPC database. See the mpcq BigQuery dataset documentation for details about the dataset, key tables (including public_obs_sbn), and performance guidance.


Observatory
Vera C. Rubin Observatory (X05)

Index Updated
Feb 15, 2026, 00:11:21 UTC

DOI
10.5281/zenodo.17047589

Please cite this DOI when using these data.
Full dataset exports
Complete Rubin (X05) observations included in this feed. Rows and time range are shared across formats; sizes and generation times are per-file.

Details (shared)
Rows
1,762,462

Observation time range
Nov 24, 2024, 07:52:28 UTC — Dec 24, 2025, 11:40:56 UTC

Files
Format	File	Size	Generated at
CSV	obs_sbn_X05_full.csv.gz	152 MB	Feb 15, 2026, 00:05:20 UTC
Parquet	obs_sbn_X05_full.parquet	166 MB	Feb 15, 2026, 00:05:20 UTC
SQLite	rubin.sqlite.gz
After download, decompress with: gunzip rubin.sqlite.gz
349 MB	Feb 15, 2026, 00:10:56 UTC
Daily Partitions
Observations are included based on the public_obs_sbn.created_at timestamp (UTC). This can differ from the observation timestamp (obstime) and the MPC submission_id, so the coverage for a given UTC date may include observations with earlier or later obstime depending on when they were ingested/created in the database.

Date (UTC)	Observations	Earliest Obs Time	Latest Obs Time	CSV Files	Parquet Files
2026-02-12	24,943	Apr 30, 2025, 00:36:14 UTC	Nov 23, 2025, 01:23:07 UTC	
obs_sbn_X05_2026-02-12.csv.gz
obs_sbn_X05_2026-02-12.parquet
2026-02-09	94,192	Jun 21, 2025, 05:49:33 UTC	Dec 20, 2025, 01:52:24 UTC	
obs_sbn_X05_2026-02-09.csv.gz
obs_sbn_X05_2026-02-09.parquet
2026-02-06	212,323	Jun 20, 2025, 04:26:48 UTC	Dec 24, 2025, 06:40:56 UTC	
obs_sbn_X05_2026-02-06.csv.gz
obs_sbn_X05_2026-02-06.parquet
2026-02-03	697,819	Jun 20, 2025, 04:26:48 UTC	Jul 29, 2025, 09:26:58 UTC	
obs_sbn_X05_2026-02-03.csv.gz
obs_sbn_X05_2026-02-03.parquet
2026-01-23	52	Nov 24, 2024, 02:52:28 UTC	Nov 29, 2024, 02:20:48 UTC	
obs_sbn_X05_2026-01-23.csv.gz
obs_sbn_X05_2026-01-23.parquet
2025-12-30	27	Nov 24, 2024, 02:53:27 UTC	Nov 29, 2024, 02:24:04 UTC	
obs_sbn_X05_2025-12-30.csv.gz
obs_sbn_X05_2025-12-30.parquet
2025-11-05	237,615	Apr 22, 2025, 02:37:21 UTC	May 04, 2025, 04:50:41 UTC	
obs_sbn_X05_2025-11-05.csv.gz
obs_sbn_X05_2025-11-05.parquet
2025-11-04	149,502	Apr 22, 2025, 02:37:21 UTC	May 04, 2025, 04:50:41 UTC	
obs_sbn_X05_2025-11-04.csv.gz
obs_sbn_X05_2025-11-04.parquet
2025-09-05	70	Jun 05, 2025, 07:09:13 UTC	Aug 15, 2025, 03:29:48 UTC	
obs_sbn_X05_2025-09-05.csv.gz
obs_sbn_X05_2025-09-05.parquet
2025-06-27	2,229	Nov 24, 2024, 02:52:28 UTC	Dec 06, 2024, 05:38:50 UTC	
obs_sbn_X05_2025-06-27.csv.gz
obs_sbn_X05_2025-06-27.parquet
2025-06-23	343,760	Apr 22, 2025, 02:37:21 UTC	May 05, 2025, 02:05:32 UTC	
obs_sbn_X05_2025-06-23.csv.gz
obs_sbn_X05_2025-06-23.parquet
Sync daily data (gsutil)
Install the Google Cloud SDK (which includes gsutil) and mirror the Rubin MPC daily files locally.

# CSV (daily files only)
gsutil -m rsync -r -x '.*(?<!\.csv.gz)$' gs://asteroid-institute-public/production/rubin/mpc/obs_sbn/daily/ ./rubin_mpc/csv

# Parquet (daily files only)
gsutil -m rsync -r -x '.*(?<!\.parquet)$' gs://asteroid-institute-public/production/rubin/mpc/obs_sbn/daily/ ./rubin_mpc/parquet
Note: The bucket is public; no authentication is required to read.

Full dataset files
Please do not download this daily due to bandwidth costs.

# Download full CSV and Parquet (curl)
curl -L -o ./rubin_mpc/full/obs_sbn_X05_full.csv.gz \
  https://storage.googleapis.com/asteroid-institute-public/production/rubin/mpc/obs_sbn/full/csv/obs_sbn_X05_full.csv.gz

curl -L -o ./rubin_mpc/full/obs_sbn_X05_full.parquet \
  https://storage.googleapis.com/asteroid-institute-public/production/rubin/mpc/obs_sbn/full/parquet/obs_sbn_X05_full.parquet
SQLite (full, gzipped):

gs://asteroid-institute-public/production/rubin/mpc/obs_sbn/sqlite/rubin.sqlite.gz
# Download and decompress full SQLite (curl)
curl -L -o ./rubin_mpc/full/rubin.sqlite.gz \
  https://storage.googleapis.com/asteroid-institute-public/production/rubin/mpc/obs_sbn/sqlite/rubin.sqlite.gz
gunzip -f ./rubin_mpc/full/rubin.sqlite.gz
Quickstart: read and query locally (Python)
# CSV
import pandas as pd

# Update the date to one you have locally
df = pd.read_csv("./rubin_mpc/csv/2024-08-17.csv.gz")
print(df.shape)
print(df.head())

# Example: inspect columns then filter
print(df.columns.tolist())
# e.g., df[df["mag"] < 20] if a 'mag' column exists
# Parquet
import pandas as pd

df = pd.read_parquet("./rubin_mpc/parquet/2024-08-17.parquet")
print(df.shape)
print(df.head())
# Distribution of r-band magnitudes in April-June 2025
import sqlite3, pandas as pd
con = sqlite3.connect('./rubin_mpc/full/rubin.sqlite')
q = """
SELECT CAST(mag AS INTEGER) AS mag_int, COUNT(*) AS n
FROM obs_sbn
WHERE band = 'r'
  AND obstime BETWEEN '2025-04-01' AND '2025-06-01'
GROUP BY mag_int
ORDER BY mag_int;
"""
df = pd.read_sql_query(q, con)
print(df)
print('\nTotal obs in range:', df['n'].sum())
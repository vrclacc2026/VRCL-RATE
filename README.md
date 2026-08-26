# VRCL-RATE

Daily rate website for Vishwas Refoils & Consumer Limited.

## Live daily-rate flow

- `admin.html` — existing rate editor and formula setup.
- `admin-live.html` — opens the existing admin and adds **LOAD ONLINE** / **PUBLISH ONLINE** controls.
- `rates.json` — shared published rate data.
- `live.html` — customer page that reads `rates.json` and checks for updates every 60 seconds.

## Daily use

1. Open `admin-live.html`.
2. Use **LOAD ONLINE** when working from another PC/device.
3. Edit rates in the admin panel and click **SAVE ALL**.
4. Enter a GitHub fine-grained token with repository **Contents: Read and write** permission.
5. Click **PUBLISH ONLINE**.
6. Customers opening `live.html` receive the latest published rates.

The GitHub token is stored only in browser `sessionStorage`, not in repository code or `localStorage`.

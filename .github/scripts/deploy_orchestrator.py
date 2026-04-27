"""
Deploys orchestrator-bundle.gs to Google Apps Script.
Called by .github/workflows/deploy-orchestrator.yml

Uses OAuth2 refresh token (not service account) because the Apps Script API
does not work with service accounts on personal Gmail accounts.
"""
import json, os, sys
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

SCRIPT_ID     = "1umCfbtutYy-Z7ygVhLtv1DjL90qBaNI-pFaBwROjUPdij5_NMsnP0Rpc"
DEPLOYMENT_ID = "AKfycbxZ22caqcCv2srn_8ir2YK2nnUo1KTVgAczozX9oLu_eEDSXe3JzWWe9mHQO_62yJZd0Q"
BUNDLE_PATH   = "agents/orchestrator/backend/orchestrator-bundle.gs"

def main():
    credentials = Credentials(
        token=None,
        refresh_token=os.environ["OAUTH_REFRESH_TOKEN"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ["OAUTH_CLIENT_ID"],
        client_secret=os.environ["OAUTH_CLIENT_SECRET"],
        scopes=[
            "https://www.googleapis.com/auth/script.projects",
            "https://www.googleapis.com/auth/script.deployments",
        ],
    )
    service = build("script", "v1", credentials=credentials)

    current = service.projects().getContent(scriptId=SCRIPT_ID).execute()
    files = current.get("files", [])

    with open(BUNDLE_PATH) as f:
        new_source = f.read()

    updated_files = []
    code_replaced = False
    for entry in files:
        if entry.get("name") == "Code" and entry.get("type") == "SERVER_JS":
            entry["source"] = new_source
            code_replaced = True
        updated_files.append(entry)
    if not code_replaced:
        updated_files.append({"name": "Code", "type": "SERVER_JS", "source": new_source})

    service.projects().updateContent(
        scriptId=SCRIPT_ID, body={"files": updated_files}
    ).execute()
    print("Content updated")

    sha = os.environ.get("GITHUB_SHA", "unknown")[:7]
    version = service.projects().versions().create(
        scriptId=SCRIPT_ID,
        body={"description": f"Auto-deploy {sha}"},
    ).execute()
    ver_num = version["versionNumber"]
    print(f"Version created: {ver_num}")

    service.projects().deployments().update(
        scriptId=SCRIPT_ID,
        deploymentId=DEPLOYMENT_ID,
        body={
            "deploymentConfig": {
                "scriptId": SCRIPT_ID,
                "versionNumber": ver_num,
                "manifestFileName": "appsscript",
                "description": f"Auto-deploy {sha}",
            }
        },
    ).execute()
    print(f"Deployment updated to version {ver_num} — done.")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

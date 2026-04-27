"""
Deploys orchestrator-bundle.gs to Google Apps Script.
Called by .github/workflows/deploy-orchestrator.yml
"""
import json, os, sys
from google.oauth2 import service_account
from googleapiclient.discovery import build

SCRIPT_ID     = "1umCfbtutYy-Z7ygVhLtv1DjL90qBaNI-pFaBwROjUPdij5_NMsnP0Rpc"
DEPLOYMENT_ID = "AKfycbxZ22caqcCv2srn_8ir2YK2nnUo1KTVgAczozX9oLu_eEDSXe3JzWWe9mHQO_62yJZd0Q"
BUNDLE_PATH   = "agents/orchestrator/backend/orchestrator-bundle.gs"

def main():
    sa_info = json.loads(os.environ["GCP_SA_KEY"])
    credentials = service_account.Credentials.from_service_account_info(
        sa_info,
        scopes=[
            "https://www.googleapis.com/auth/script.projects",
            "https://www.googleapis.com/auth/script.deployments",
        ],
    )
    service = build("script", "v1", credentials=credentials)

    # Get current content to preserve the manifest and all other files
    current = service.projects().getContent(scriptId=SCRIPT_ID).execute()
    files = current.get("files", [])

    with open(BUNDLE_PATH) as f:
        new_source = f.read()

    # Replace the Code file, keep everything else unchanged
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

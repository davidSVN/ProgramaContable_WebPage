
import requests
import time

def test_fix():
    base_url = "http://localhost:8000/api"
    ts = int(time.time())
    email_admin = f"admin_{ts}@example.com"
    email_emp = f"emp_{ts}@example.com"
    biz_name = f"Biz_{ts}"
    alt_name = f"AltName_{ts}"
    
    # 1. Register Admin
    print(f"--- 1. Registering Admin {email_admin} ---")
    r = requests.post(f"{base_url}/auth/register", json={"name": "Admin", "email": email_admin, "password": "pass"})
    t_adm = r.json()["access_token"]
    
    # 2. Setup Business
    print(f"--- 2. Setting up business {biz_name} ---")
    r = requests.post(f"{base_url}/auth/setup/business", 
                      json={"nombre_negocio": biz_name}, 
                      headers={"Authorization": f"Bearer {t_adm}"})
    tenant_id = r.json()["tenant_id"]

    # 2.5 Upgrade Plan directly in DB (to bypass 402/403 on settings)
    print(f"--- 2.5 Upgrading plan for Tenant {tenant_id} ---")
    import subprocess
    db_script = f"""
import asyncio
from app.database import AsyncSessionLocal
from app.models import Tenant
async def upgrade():
    async with AsyncSessionLocal() as db:
        tenant = await db.get(Tenant, {tenant_id})
        tenant.plan = 'basic'
        await db.commit()
asyncio.run(upgrade())
"""
    with open("tmp_upgrade.py", "w") as f: f.write(db_script)
    subprocess.run(["python", "tmp_upgrade.py"], check=True)

    # 3. Verify settings (should be biz_name)
    print("--- 3. Verifying initial settings ---")
    r = requests.get(f"{base_url}/settings/business", headers={"Authorization": f"Bearer {t_adm}"})
    if r.status_code != 200:
        print(f"Error: Status {r.status_code}")
        print(f"Response: {r.text}")
        return
    
    data = r.json()
    print(f"Settings business_name: {data.get('business_name')}")
    assert data.get('business_name') == biz_name
    
    # 4. Change setting to alt_name
    print(f"--- 4. Changing setting to {alt_name} ---")
    requests.put(f"{base_url}/settings/business", 
                 json={"business_name": alt_name},
                 headers={"Authorization": f"Bearer {t_adm}"})
    
    # 5. Register Employee
    print(f"--- 5. Registering Employee {email_emp} ---")
    r = requests.post(f"{base_url}/auth/register", json={"name": "Emp", "email": email_emp, "password": "pass"})
    t_emp = r.json()["access_token"]
    
    # 6. Join Request using alt_name
    print(f"--- 6. Sending join request using {alt_name} ---")
    r = requests.post(f"{base_url}/auth/setup/join-request", 
                      json={"nombre_negocio": alt_name}, 
                      headers={"Authorization": f"Bearer {t_emp}"})
    print(f"Join Request (alt_name) Status: {r.status_code}")
    assert r.status_code == 200
    
    # 7. Join Request using biz_name (original tenant name)
    # (Need another employee since one can only have one pending request)
    email_emp2 = f"emp2_{ts}@example.com"
    print(f"--- 7. Registering Employee 2 {email_emp2} ---")
    r = requests.post(f"{base_url}/auth/register", json={"name": "Emp2", "email": email_emp2, "password": "pass"})
    t_emp2 = r.json()["access_token"]
    
    print(f"--- 8. Sending join request using original {biz_name} ---")
    r = requests.post(f"{base_url}/auth/setup/join-request", 
                      json={"nombre_negocio": biz_name}, 
                      headers={"Authorization": f"Bearer {t_emp2}"})
    print(f"Join Request (biz_name) Status: {r.status_code}")
    assert r.status_code == 200
    
    print("\n✅ Verification SUCCESS! Join requests work by both tenant name and setting name.")

if __name__ == "__main__":
    test_fix()

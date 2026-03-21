import requests
import time

def test_join_request_flow():
    base_url = "http://localhost:8000/api"
    ts = int(time.time())
    email_admin = f"admin_{ts}@example.com"
    email_emp = f"emp_{ts}@example.com"
    biz_name = f"Biz_{ts}"
    
    # 1. Register Admin
    print(f"Registering Admin {email_admin}...")
    r_adm = requests.post(f"{base_url}/auth/register", json={"name": "Admin", "email": email_admin, "password": "pass"})
    t_adm = r_adm.json()["access_token"]
    
    # 2. Setup Business
    print(f"Setting up business {biz_name}...")
    requests.post(f"{base_url}/auth/setup/business", 
                  json={"nombre_negocio": biz_name}, 
                  headers={"Authorization": f"Bearer {t_adm}"})
    
    # 3. Register Employee
    print(f"Registering Employee {email_emp}...")
    r_emp = requests.post(f"{base_url}/auth/register", json={"name": "Emp", "email": email_emp, "password": "pass"})
    t_emp = r_emp.json()["access_token"]
    
    # 4. Join Request
    print("Sending join request...")
    requests.post(f"{base_url}/auth/setup/join-request", 
                  json={"nombre_negocio": biz_name}, 
                  headers={"Authorization": f"Bearer {t_emp}"})
    
    # 5. Check Status
    print("Checking setup status for employee...")
    r_stat = requests.get(f"{base_url}/auth/setup/status", headers={"Authorization": f"Bearer {t_emp}"})
    print(f"Status: {r_stat.status_code}")
    print(f"Response: {r_stat.text}")

if __name__ == "__main__":
    test_join_request_flow()

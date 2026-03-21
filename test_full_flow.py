import requests
import time

def test_full_auth_flow():
    base_url = "http://localhost:8000/api"
    email = f"test_{int(time.time())}@example.com"
    
    # 1. Register
    print(f"Registering {email}...")
    reg_payload = {"name": "Test Bot", "email": email, "password": "password123"}
    r1 = requests.post(f"{base_url}/auth/register", json=reg_payload)
    print(f"Register Status: {r1.status_code}")
    if r1.status_code != 200:
        print(f"Register Failed: {r1.text}")
        return
    
    token = r1.json().get("access_token")
    print(f"Token obtained: {token[:20]}...")
    
    # 2. Setup Status
    print("Checking setup status...")
    headers = {"Authorization": f"Bearer {token}"}
    r2 = requests.get(f"{base_url}/auth/setup/status", headers=headers)
    print(f"Setup Status: {r2.status_code}")
    print(f"Setup Response: {r2.text}")

if __name__ == "__main__":
    test_full_auth_flow()

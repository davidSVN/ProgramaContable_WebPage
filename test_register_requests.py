import requests
import json

def test_register_curl():
    url = "http://localhost:8000/api/auth/register"
    payload = {
        "name": "Test User",
        "email": "test@example.com",
        "password": "password123"
    }
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    test_register_curl()

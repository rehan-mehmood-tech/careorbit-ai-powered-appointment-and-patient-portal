"""Idempotent Firebase development seed. Requires Application Default Credentials."""
from datetime import UTC, datetime, timedelta
import argparse
from firebase_admin import auth, firestore
from app.auth import initialize_firebase

USERS=[
 ("patient@careorbit.test","CareOrbitPatient!2026","patient","Sara Ahmed"),
 ("doctor@careorbit.test","CareOrbitDoctor!2026","doctor","Dr. Ayesha Khan"),
 ("admin@careorbit.test","CareOrbitAdmin!2026","admin","CareOrbit Admin"),
]

def account(email,password,role,name,reset):
    try:
        user=auth.get_user_by_email(email)
        if reset: auth.update_user(user.uid,password=password,display_name=name)
    except auth.UserNotFoundError:
        user=auth.create_user(email=email,password=password,display_name=name,email_verified=True)
    auth.set_custom_user_claims(user.uid,{"role":role})
    firestore.client().collection("users").document(user.uid).set({"email":email,"name":name,"role":role,"status":"active","verified":role!="doctor" or True,"updatedAt":firestore.SERVER_TIMESTAMP},merge=True)
    return user.uid

def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--reset-passwords",action="store_true",help="Explicitly replace passwords for existing demo accounts")
    args=parser.parse_args(); initialize_firebase()
    ids={role:account(email,password,role,name,args.reset_passwords) for email,password,role,name in USERS}
    db=firestore.client(); start=datetime.now(UTC)+timedelta(days=3)
    db.collection("doctorProfiles").document(ids["doctor"]).set({"userId":ids["doctor"],"name":"Dr. Ayesha Khan","specialty":"Cardiology","verified":True,"status":"active","languages":["English","Urdu"],"consultationFee":3500,"updatedAt":firestore.SERVER_TIMESTAMP},merge=True)
    db.collection("patientProfiles").document(ids["patient"]).set({"userId":ids["patient"],"name":"Sara Ahmed","updatedAt":firestore.SERVER_TIMESTAMP},merge=True)
    db.collection("appointments").document("demo-upcoming-appointment").set({"patientId":ids["patient"],"doctorId":ids["doctor"],"patientName":"Sara Ahmed","doctorName":"Dr. Ayesha Khan","reason":"Synthetic development follow-up","status":"Confirmed","date":start.strftime("%Y-%m-%d"),"time":"10:30 AM","mode":"Video","startsAt":start,"synthetic":True,"updatedAt":firestore.SERVER_TIMESTAMP},merge=True)
    print("Demo seed complete. Existing passwords were preserved unless --reset-passwords was supplied.")

if __name__=="__main__": main()

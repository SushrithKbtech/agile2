from flask import Flask, render_template, request, jsonify, send_file
from flask_socketio import SocketIO, join_room, emit
from flask_cors import CORS
from fpdf import FPDF
import os
import sqlite3
import speech_recognition as sr
import openai  # For integrating ChatGPT API

# Initialize OpenAI API key
openai.api_key = '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'  # Replace with your actual OpenAI API key

app = Flask(__name__)
CORS(app)  # Enable CORS
socketio = SocketIO(app, cors_allowed_origins="*")  # Allow cross-origin requests

# Ensure the uploads directory exists
if not os.path.exists("uploads"):
    os.makedirs("uploads")

# Doctor-patient mapping
appointments = {
    "doctor_suresh": ["ravi", "shreya"],
}

# Database setup
def init_db():
    conn = sqlite3.connect("recordings.db")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS recordings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            transcription TEXT
        )
    """)
    conn.commit()
    conn.close()

init_db()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/doctor/<doctor_id>")
def doctor(doctor_id):
    if doctor_id in appointments:
        room = f"{doctor_id}-general"
        return render_template("doctor.html", doctor_id=doctor_id, room=room)
    return "Doctor not found", 404

@app.route("/patient/<patient_name>")
def patient(patient_name):
    for doctor, patients in appointments.items():
        if patient_name in patients:
            room = f"{doctor}-general"
            return render_template("patient.html", patient_name=patient_name, doctor_id=doctor, room=room)
    return "Patient not found", 404

@app.route("/call/<room>")
def video_call(room):
    return render_template("call.html", room=room)

@app.route("/process_transcription", methods=["POST"])
def process_transcription():
    data = request.get_json()
    transcription = data.get("transcription")
    
    if not transcription:
        return jsonify({"error": "No transcription received"}), 400

   
    transcription_path = "uploads/transcriptions.txt"
    try:
        with open(transcription_path, "a") as f:
            f.write(transcription + "\n\n")
    except Exception as e:
        print(f"Error saving transcription: {e}")
        return jsonify({"error": "Failed to save transcription."}), 500
    
    
    medical_report = generate_medical_report(transcription)

   
    pdf_path = "uploads/medical_report.pdf"
    try:
        if medical_report.strip():
            pdf = FPDF()
            pdf.add_page()
            pdf.set_font("Arial", size=12)
            pdf.multi_cell(0, 10, txt=medical_report)
            pdf.output(pdf_path)
        else:
            print("Medical report is empty; skipping PDF generation.")
            return jsonify({"error": "Medical report is empty, unable to generate PDF."}), 500
    except Exception as e:
        print(f"Error generating PDF: {e}")
        return jsonify({"error": "Failed to generate PDF."}), 500

    return jsonify({"message": "Transcription saved and medical report generated.", "pdf_path": pdf_path})



def generate_medical_report(transcription):
    prompt = f"""Given the transcription of a medical conversation, generate a structured medical report under the following headings:

    - Diagnosis
    - Medications and Dosage
    - Lifestyle Changes

    Transcription:
    {transcription}

    Formatted Medical Report:"""

    try:
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",  
            messages=[
                {"role": "system", "content": "You are a helpful assistant that formats medical reports."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=1000
        )
        report = response['choices'][0]['message']['content'].strip()
        return report
    except Exception as e:
        print(f"Error generating report: {e}")
        return "Unable to generate a medical report due to an error."


@socketio.on("join_room")
def handle_join_room(data):
    room = data.get("room")
    user = data.get("user", "Unknown User")
    if room:
        join_room(room)
        emit("user_joined", {"user": user}, to=room)

@socketio.on("save_transcription")
def handle_save_transcription(data):
    room = data.get("room")
    transcription = data.get("transcription")
    user = data.get("user", "Unknown User")
    if transcription:
        message = f"{user}: {transcription}"
        transcription_path = "uploads/transcriptions.txt"
        with open(transcription_path, "a") as f:
            f.write(message + "\n")
        emit("update_transcription", {"user": user, "transcription": message}, to=room)

@socketio.on("signal")
def handle_signal(data):
    emit("signal", data, to=data["room"], skip_sid=request.sid)

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)

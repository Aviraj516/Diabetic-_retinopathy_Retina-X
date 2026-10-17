with open('src/components/NewScreeningFlow.tsx', 'r') as f:
    content = f.read()

# Fix patient -> (selectedPatient || patients[0])
content = content.replace("{patient.fullName}", "{(selectedPatient || patients[0])?.fullName}")
content = content.replace("{patient.id}", "{(selectedPatient || patients[0])?.id}")
content = content.replace("patient.age", "(selectedPatient || patients[0])?.age")
content = content.replace("patient.gender", "(selectedPatient || patients[0])?.gender")
content = content.replace("patient.phoneNumber", "(selectedPatient || patients[0])?.phoneNumber")

# Remove <StepperHeader />
content = content.replace("<StepperHeader />", "")

# Remove setStep references or change them to resetWizard
import re
content = re.sub(r"onClick=\{\(\) => setStep\([^)]+\)\}", "onClick={handleReset}", content)

with open('src/components/NewScreeningFlow.tsx', 'w') as f:
    f.write(content)

print("Fixed TS errors")

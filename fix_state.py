with open('src/components/NewScreeningFlow.tsx', 'r') as f:
    content = f.read()

target = "// Processing state (maps to existing mlLoading)"

replacement = """
  // Processing state (maps to existing mlLoading)
  const [mlLoading, setMlLoading] = useState(false);
  const [mlError, setMlError] = useState<string | null>(null);
  const [mlResult, setMlResult] = useState<MLAnalysisResult | null>(null);
  const [activeXaiTab, setActiveXaiTab] = useState<XaiTab>('Original');
  const [heatmapOpacity, setHeatmapOpacity] = useState<number>(70);

  const runAnalysis = useCallback(async () => {
    if (!screeningWizard.imageFile?.actualFile) {
      setMlError('No image file available for analysis. Please re-upload the image.');
      return;
    }
    setMlLoading(true);
    setMlError(null);
    setMlResult(null);
    try {
      const patient = selectedPatient || patients[0];
      const result = await analyzeRetinalImage(screeningWizard.imageFile.actualFile, {
        patientId: patient?.id,
        patientName: patient?.fullName,
        patientAge: patient?.age,
        patientGender: patient?.gender,
        patientPhone: patient?.phoneNumber,
        eyeSide: selectedEye,
      });
      if (result.error) {
        setMlError(result.error);
      } else {
        setMlResult(result);
        setActiveCase(result);
      }
    } catch (err: any) {
      setMlError(err.message || 'ML server error. Make sure ml_server.py is running.');
    } finally {
      setMlLoading(false);
    }
  }, [screeningWizard.imageFile, selectedPatient, selectedEye, setActiveCase, patients]);

"""

new_content = content.replace(target, replacement)

with open('src/components/NewScreeningFlow.tsx', 'w') as f:
    f.write(new_content)

print("Done")

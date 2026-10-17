import re

with open('src/components/NewScreeningFlow.tsx', 'r') as f:
    content = f.read()

# We want to replace from `const [step, setStep]` down to `// STEP 6: SCREENING RESULT & XAI VIEWER`
start_marker = "const [step, setStep] = useState<"
end_marker = "const result = screeningWizard.activeResult;"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print("Could not find markers")
    exit(1)

new_ui = """
  // Patient & Image selection state
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [selectedEye, setSelectedEye] = useState<EyeSelection>('Right Eye');
  const [patientSearchStr, setPatientSearchStr] = useState('');
  
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageMetadata, setImageMetadata] = useState<any | null>(null);
  
  // Processing state (maps to existing mlLoading)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setWizardImageFile({
      name: file.name,
      size: `${(file.size / 1024).toFixed(0)} KB`,
      previewUrl: URL.createObjectURL(file),
      actualFile: file,
    });
    
    setPreviewUrl(URL.createObjectURL(file));
    setImageMetadata({
      filename: file.name,
      fileSize: file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`,
      resolution: '... Measuring'
    });

    setMlResult(null);
    setMlError(null);
  };

  const handleReset = () => {
    setWizardImageFile(null);
    setPreviewUrl(null);
    setImageMetadata(null);
    setMlResult(null);
    setMlError(null);
    resetWizard();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filteredPatients = patients.filter(
    (p) =>
      p.fullName.toLowerCase().includes(patientSearchStr.toLowerCase()) ||
      p.id.toLowerCase().includes(patientSearchStr.toLowerCase())
  );
  
  const handleStartScreening = async () => {
    if (!screeningWizard.imageFile?.actualFile) {
      setMlError('Please upload a retinal fundus image first.');
      return;
    }
    
    setWizardPatient(selectedPatient || patients[0]);
    setWizardEye(selectedEye);
    
    await runAnalysis();
    
    // Auto continue if successful
    setTimeout(() => {
        setWizardQualityPassed(true);
        // build result logic will happen in runAnalysis or here
    }, 1000);
  };

  // Build the Single Page Layout replacing the wizard
  if (!mlResult && !mlLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border border-teal-100 rounded-2xl p-6 text-slate-800 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 bg-teal-100 text-teal-700 border border-teal-200 rounded-full text-xs font-semibold uppercase tracking-wider">
                Diabetic Retinopathy Pipeline • Module 1
              </span>
              <span className="px-2.5 py-0.5 bg-cyan-100 text-cyan-700 text-xs rounded-full font-medium">
                Realtime ML Screening
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-800">
              Diabetic Retinopathy Screening
            </h1>
            <p className="text-slate-600 text-sm mt-1 max-w-2xl">
              Automated lesion detection, severity grading, and comprehensive anatomical analysis for early DR intervention.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Patient Selection & Eye selection */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-500" />
                1. Select Patient
              </h2>
              {selectedPatient && (
                <button
                  onClick={() => setSelectedPatient(null)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Clear
                </button>
              )}
            </div>

            {selectedPatient ? (
              <div className="p-3.5 bg-teal-50/50 border border-teal-200 rounded-xl">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{selectedPatient.fullName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      ID: <span className="text-teal-600 font-mono">{selectedPatient.id}</span>
                    </p>
                  </div>
                  <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-xs rounded-md">Selected</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Search registered patients..."
                  value={patientSearchStr}
                  onChange={(e) => setPatientSearchStr(e.target.value)}
                  className="w-full px-3 py-2 bg-[#F8F9FA] border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-teal-500"
                />

                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                  {filteredPatients.length > 0 ? (
                    filteredPatients.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => setSelectedPatient(p)}
                        className="p-2.5 bg-white hover:bg-[#F8F9FA] border border-slate-200 hover:border-teal-300 rounded-lg cursor-pointer transition-all flex justify-between items-center text-xs"
                      >
                        <div>
                          <p className="font-medium text-slate-800">{p.fullName}</p>
                          <p className="text-slate-500">{p.id}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 bg-slate-50 rounded-lg text-center text-xs text-slate-500">
                      No patients found. Screening will run as <span className="text-teal-600 font-medium">Walk-in Patient</span>.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Eye Selection */}
            <div className="pt-2 border-t border-slate-200">
              <label className="text-xs font-semibold text-slate-500 block mb-2">
                2. Target Eye
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['Right Eye', 'Left Eye'] as EyeSelection[]).map((eye) => (
                  <button
                    key={eye}
                    type="button"
                    onClick={() => setSelectedEye(eye)}
                    className={`py-2 px-3 rounded-lg text-xs font-medium border flex items-center justify-center gap-2 transition-all ${
                      selectedEye === eye
                        ? 'bg-teal-50 text-teal-700 border-teal-300 font-bold'
                        : 'bg-white text-slate-500 border-slate-200 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {eye} ({eye === 'Right Eye' ? 'OD' : 'OS'})
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Upload Area */}
          <div className="lg:col-span-2 bg-white border border-slate-200 shadow-sm rounded-2xl p-5 space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-teal-500" />
                  3. Upload Retinal Fundus Image
                </h2>
                <span className="text-xs text-slate-400">Supports JPG, PNG, TIFF, DICOM</span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="dr-file-upload"
              />

              {!previewUrl ? (
                <label
                  htmlFor="dr-file-upload"
                  className="border-2 border-dashed border-slate-300 hover:border-teal-400 bg-slate-50 hover:bg-teal-50/50 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all group min-h-[360px]"
                >
                  <div className="w-16 h-16 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center group-hover:scale-110 transition-transform mb-3">
                    <Upload className="w-8 h-8" />
                  </div>
                  <p className="font-semibold text-slate-800 text-sm">
                    Click to browse or drop retinal fundus photograph here
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Standard 45°/50° macular or optic disc centered fundus photograph
                  </p>
                </label>
              ) : (
                <div className="flex flex-col h-full space-y-6">
                  <div className="relative rounded-xl overflow-hidden bg-[#F8F9FA] flex items-center justify-center min-h-[300px] h-[360px] border border-slate-200">
                    <img
                      src={previewUrl}
                      alt="Fundus preview"
                      className="max-w-full max-h-full object-contain"
                    />
                    <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-semibold text-slate-800 shadow-sm border border-slate-200">
                      Preview Ready
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-slate-500 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate max-w-[150px]">{imageMetadata?.filename}</span>
                      </div>
                      <div className="w-px h-4 bg-slate-300" />
                      <span>{imageMetadata?.fileSize}</span>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <button
                        onClick={handleReset}
                        className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold transition-colors flex items-center gap-2"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Change
                      </button>
                      <button
                        onClick={handleStartScreening}
                        className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-white shadow-md text-sm font-bold transition-all flex items-center justify-center gap-2 group"
                      >
                        <CheckCircle2 className="w-4 h-4 text-teal-100 group-hover:text-white" />
                        Run AI Screening
                        <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {mlError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2 mt-4">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{mlError}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (mlLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-6 shadow-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal-100 text-teal-600 border border-teal-200 animate-pulse">
            <Activity className="w-8 h-8 animate-spin" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-800">Evaluating Retinal Clinical Indicators</h3>
            <p className="text-slate-500 text-xs mt-1">Executing lesion detection and anatomical validation</p>
          </div>
        </div>
      </div>
    );
  }

"""

# Ensure we keep the `const result = ...` line by injecting it after new_ui
new_content = content[:start_idx] + new_ui + "\n  " + end_marker + content[end_idx + len(end_marker):]

with open('src/components/NewScreeningFlow.tsx', 'w') as f:
    f.write(new_content)

print("Done")

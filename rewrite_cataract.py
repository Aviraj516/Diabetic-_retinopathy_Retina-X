with open('src/components/CataractScreeningFlow.tsx', 'r') as f:
    content = f.read()

import re

# 1. Replace the Header block
# Original starts at `<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">`
# and ends right before `{/* 5-Step Indicator */}`

new_header = """
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border border-teal-100 rounded-2xl p-6 text-slate-800 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-1 bg-teal-100 text-teal-700 border border-teal-200 rounded-full text-xs font-semibold uppercase tracking-wider">
              Cataract Pipeline • Module 3
            </span>
            <span className="px-2.5 py-0.5 bg-cyan-100 text-cyan-700 text-xs rounded-full font-medium">
              Realtime ML Screening
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-800">
            Cataract Screening
          </h1>
          <p className="text-slate-600 text-sm mt-1 max-w-2xl">
            AI-assisted cataract screening using a cascaded five-stage deep learning pipeline.
          </p>
        </div>
        
        {mlResult && (
          <button
            type="button"
            onClick={resetFlow}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 shadow-sm transition-colors"
          >
            <RotateCcw className="w-4 h-4 text-teal-600" />
            <span>New Screening</span>
          </button>
        )}
      </div>
"""

# Regex substitution for header
content = re.sub(
    r'<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">.*?</div>\s*(?=\{/\* 5-Step Indicator \*/\})',
    new_header,
    content,
    flags=re.DOTALL
)

# 2. Replace sky colors with teal
content = content.replace("bg-sky-50 text-sky-700 border-sky-100", "bg-teal-50 text-teal-700 border-teal-100")
content = content.replace("bg-[#0284C7]", "bg-teal-500")
content = content.replace("hover:bg-sky-600", "hover:bg-teal-600")
content = content.replace("active:bg-sky-700", "active:bg-teal-700")
content = content.replace("ring-sky-100", "ring-teal-100")
content = content.replace("text-sky-700", "text-teal-700")
content = content.replace("text-sky-600", "text-teal-600")
content = content.replace("text-sky-500", "text-teal-500")
content = content.replace("bg-sky-600", "bg-teal-600")
content = content.replace("bg-sky-500", "bg-teal-500")
content = content.replace("bg-sky-50", "bg-teal-50")
content = content.replace("hover:bg-sky-50", "hover:bg-teal-50")
content = content.replace("hover:text-sky-800", "hover:text-teal-800")
content = content.replace("border-sky-500", "border-teal-500")
content = content.replace("border-sky-200", "border-teal-200")
content = content.replace("ring-sky-500", "ring-teal-500")
content = content.replace("text-sky-950", "text-teal-900")
content = content.replace("shadow-sky-500", "shadow-teal-500")
content = content.replace("border-sky-600", "border-teal-600")


# 3. Replace the clinical overview card which is dark
old_dark_card = """            {/* Clinical Overview Card */}
            <div className="bg-slate-900 text-white rounded-xl p-5 shadow-2xs space-y-3 border border-slate-800">
              <div className="flex items-center gap-2 text-sky-400 text-xs font-bold uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                <span>Anterior Segment Clinical Evaluation</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Structured clinical triage: verifies image focus and illumination, maps anterior corneal curvature and pupillary margin, and grades crystalline lens transparency.
              </p>
              <div className="text-[11px] text-slate-400 border-t border-slate-800 pt-2 flex items-center justify-between">
                <span>Clinical Triage System</span>
                <span className="text-emerald-400 font-semibold">Realtime Analysis</span>
              </div>
            </div>"""

new_light_card = """            {/* Clinical Overview Card */}
            <div className="bg-teal-50 text-slate-800 rounded-xl p-5 border border-teal-100 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-teal-600 text-xs font-bold uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                <span>Anterior Segment Clinical Evaluation</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Structured clinical triage: verifies image focus and illumination, maps anterior corneal curvature and pupillary margin, and grades crystalline lens transparency.
              </p>
              <div className="text-[11px] text-slate-500 border-t border-teal-200/60 pt-2 flex items-center justify-between">
                <span>Clinical Triage System</span>
                <span className="text-teal-700 font-semibold">Realtime Analysis</span>
              </div>
            </div>"""

content = content.replace(old_dark_card, new_light_card)
# Might need regex if formatting is slightly different, let's use regex for safety
content = re.sub(
    r'\{\/\* Clinical Overview Card \*\/\}\s*<div className="bg-slate-900.*?</div>\s*</div>',
    new_light_card,
    content,
    flags=re.DOTALL
)

with open('src/components/CataractScreeningFlow.tsx', 'w') as f:
    f.write(content)

print("Updated Cataract screening flow.")

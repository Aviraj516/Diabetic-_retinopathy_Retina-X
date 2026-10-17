with open('src/components/CataractScreeningFlow.tsx', 'r') as f:
    content = f.read()

import re

# We need to target the dark card again because regex failed
dark_card_regex = r'<div className="bg-slate-900 text-white rounded-xl p-5 shadow-2xs space-y-3 border border-slate-800">.*?</div>\s*</div>'
content = re.sub(
    dark_card_regex,
    r"""{/* Clinical Overview Card */}
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
            </div>
          </div>""",
    content,
    flags=re.DOTALL
)

# Convert dark mode classes to light pastel classes
content = content.replace('bg-slate-900/90', 'bg-white shadow-sm')
content = content.replace('bg-slate-900', 'bg-white')
content = content.replace('bg-slate-950', 'bg-[#F8F9FA]')
content = content.replace('border-slate-800', 'border-slate-200')
content = content.replace('border-slate-700', 'border-slate-200')
content = content.replace('text-white', 'text-slate-800')

# Specifically for the active tabs text white (if they exist) we might want to keep the contrast
# But text-slate-800 is fine for light mode.
# Fix buttons that were text-white intentionally
content = content.replace('active:bg-teal-700 text-slate-800', 'active:bg-teal-700 text-white')
content = content.replace('bg-teal-500 text-slate-800', 'bg-teal-500 text-white')
content = content.replace('bg-[#0284C7] text-slate-800', 'bg-[#0284C7] text-white')
content = content.replace('bg-emerald-600 text-slate-800', 'bg-emerald-600 text-white')
content = content.replace('bg-red-600 text-slate-800', 'bg-red-600 text-white')
content = content.replace('bg-teal-600 text-slate-800', 'bg-teal-600 text-white')

# There are some text-slate-300 / text-slate-400 that are too light for white backgrounds
content = content.replace('text-slate-300', 'text-slate-600')
# Leave text-slate-400 as it is usually okay for small secondary text in light mode.

with open('src/components/CataractScreeningFlow.tsx', 'w') as f:
    f.write(content)

print("Applied light pastel colors globally to CataractScreeningFlow")

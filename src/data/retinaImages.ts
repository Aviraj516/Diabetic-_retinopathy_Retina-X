/**
 * Fundus Retina Visual Assets and Vector Renderers
 * Provides realistic medical rendering for fundus retina, Grad-CAM++ heatmap,
 * lesion annotations (microaneurysms, hemorrhages, hard exudates),
 * and retinal anatomy (optic disc, macula, vascular arcade).
 */

export type XaiTab = 'Original' | 'Grad-CAM++' | 'Lesions' | 'Anatomy' | 'Combined';

export interface VisualEvidence {
  id: string;
  title: string;
  category: string;
  description: string;
  count?: number;
  significance: string;
}

export const EVIDENCE_CARDS: VisualEvidence[] = [
  {
    id: 'ma',
    title: 'Microaneurysms',
    category: 'Vascular Pathology',
    description: 'Focal dilation of retinal capillaries appearing as small red dots.',
    count: 14,
    significance: 'Primary early indicator of Diabetic Retinopathy progression.',
  },
  {
    id: 'hem',
    title: 'Hemorrhages',
    category: 'Vascular Leakage',
    description: 'Blot and flame-shaped intraretinal bleeding within the middle retinal layers.',
    count: 8,
    significance: 'Signifies active capillary breakdown and ischemic stress.',
  },
  {
    id: 'ex',
    title: 'Hard Exudates',
    category: 'Lipid Deposition',
    description: 'Waxy yellow lipid deposits accumulating secondary to chronic vascular leakage.',
    count: 19,
    significance: 'Clustering near fovea indicates risk for diabetic macular edema (DME).',
  },
  {
    id: 'gradcam',
    title: 'Grad-CAM++ Contrast',
    category: 'Attention Heatmap',
    description: 'Gradient-weighted class activation mapping highlighting model attention zone.',
    significance: 'Concentration over temporal macular arcade drove 87% confidence prediction.',
  },
];

// Presets for demo fundus selection in upload simulation
export interface PresetFundusImage {
  id: string;
  name: string;
  size: string;
  quality: 'Good' | 'Borderline';
  eye: 'Right Eye' | 'Left Eye';
}

export const PRESET_IMAGES: PresetFundusImage[] = [
  {
    id: 'retina_1034',
    name: 'retina_1034.jpg',
    size: '2.4 MB',
    quality: 'Good',
    eye: 'Right Eye',
  },
  {
    id: 'fundus_sample_02',
    name: 'fundus_macula_od.png',
    size: '3.1 MB',
    quality: 'Good',
    eye: 'Left Eye',
  },
  {
    id: 'fundus_sample_03',
    name: 'telemed_retina_hd.jpg',
    size: '1.9 MB',
    quality: 'Good',
    eye: 'Right Eye',
  },
];

// Hand-built relevance judgements, grounded in the actual corpus.
//
// Each query carries two kinds of ground truth:
//   docs  - documents that genuinely answer it (document-level relevance)
//   must  - a fact that a correct passage has to contain (passage-level)
// Document-level alone is too lenient here, because several papers overlap;
// requiring the fact text is what separates "right paper" from "right passage".
export const QUERIES = [
  { q: 'Which datasets were used in this research?', docs: ['pipeline', 'diffusion', 'quality-umb', 'quality-arxiv', 'gcn'], must: /HUNT4|CAMUS|TRUST/i },
  { q: 'What is gCNR and what does it measure?', docs: ['quality-umb', 'quality-arxiv', 'thesis'], must: /gCNR|generalized contrast/i },
  { q: 'How does the graph convolutional network keep segmentations anatomically correct?', docs: ['gcn', 'thesis'], must: /anatomic|keypoint|contour/i },
  { q: 'How are diffusion models used to augment training data?', docs: ['diffusion', 'thesis'], must: /diffusion|DDPM|generat/i },
  { q: 'What is inter-model agreement used for?', docs: ['gcn', 'thesis'], must: /agreement/i },
  { q: 'How fast does the lightweight model run at inference time?', docs: ['lightweight', 'gcn', 'thesis'], must: /real-?time|FPS|ms\b|latency|speed/i },
  { q: 'What Dice score was achieved on the CAMUS dataset?', docs: ['gcn', 'diffusion', 'lightweight', 'thesis'], must: /dice/i },
  { q: 'How is ejection fraction measured automatically?', docs: ['pipeline', 'gcn', 'thesis'], must: /ejection fraction|EF\b|volume/i },
  { q: 'What is the Hausdorff distance used for?', docs: ['gcn', 'diffusion', 'lightweight', 'thesis'], must: /hausdorff/i },
  { q: 'How many echocardiographic exams are in the clinical database?', docs: ['pipeline', 'thesis'], must: /\d{3,}/ },
  { q: 'Why is nnU-Net not suitable for real-time clinical use?', docs: ['lightweight', 'gcn', 'thesis'], must: /nnu-?net/i },
  { q: 'How were the image quality labels annotated?', docs: ['quality-umb', 'quality-arxiv', 'thesis'], must: /annotat|label|observer|cardiologist/i },
  { q: 'What is the HUNT4 study?', docs: ['quality-arxiv', 'quality-umb', 'diffusion', 'gcn', 'pipeline', 'thesis'], must: /HUNT4|Nord-?Tr/i },
  { q: 'How are out-of-sector or poor views detected and rejected?', docs: ['pipeline', 'quality-umb', 'quality-arxiv', 'thesis'], must: /sector|reject|discard|exclud|quality/i },
  { q: 'What data augmentations were applied during training?', docs: ['diffusion', 'gcn', 'lightweight', 'thesis'], must: /augment/i },
  { q: 'How is the keypoint representation of the heart structured?', docs: ['gcn', 'thesis'], must: /keypoint|contour point|ring/i },
  { q: 'What loss function was used to train the network?', docs: ['gcn', 'diffusion', 'lightweight', 'quality-umb', 'thesis'], must: /loss/i },
  { q: 'How does automatic segmentation compare to inter-observer variability?', docs: ['gcn', 'pipeline', 'quality-umb', 'thesis'], must: /observer|variabilit/i },
  { q: 'Which clinical measurements does the pipeline automate?', docs: ['pipeline', 'thesis'], must: /GLS|ejection fraction|volume|measurement/i },
  { q: 'How was the realism of generated ultrasound images validated?', docs: ['diffusion', 'thesis'], must: /survey|expert|realis|distinguish/i },
  { q: 'Does image quality affect measurement accuracy?', docs: ['quality-umb', 'quality-arxiv', 'pipeline', 'thesis'], must: /quality/i },
  { q: 'What are the main limitations of this work?', docs: ['gcn', 'diffusion', 'pipeline', 'quality-umb', 'lightweight', 'thesis'], must: /limitation|however|not evaluat|future/i },
  { q: 'How does the U-Net baseline architecture work?', docs: ['gcn', 'diffusion', 'lightweight', 'thesis'], must: /u-?net/i },
  { q: 'What is the effect of training set size on segmentation performance?', docs: ['diffusion', 'gcn', 'thesis'], must: /training (set|data)|amount of (data|annotat)|limited data/i },
  { q: 'How is the diffusion model conditioned on segmentation masks?', docs: ['diffusion', 'thesis'], must: /condition|mask/i },
  { q: 'What preprocessing is applied to the ultrasound images?', docs: ['gcn', 'diffusion', 'pipeline', 'lightweight', 'thesis'], must: /preprocess|resiz|normali|crop|scal/i },
];

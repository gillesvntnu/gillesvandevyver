"""Corpus definition for the in-browser RAG demo.

Each entry describes one source document in papers_pdf/.  Edit this file when a
new paper is added, then re-run:

    python3 scripts/build_rag_chunks.py
    node scripts/build_rag_embeddings.mjs

`pages` is an inclusive 1-based PDF page range that limits what gets indexed.
It is used for the PhD thesis, which reproduces three of the papers verbatim as
chapters 3-5; indexing those pages again would flood the retriever with
duplicates, so only the introduction and background chapters are indexed.
"""

CORPUS = [
    {
        "id": "gcn",
        "file": "Toward_Robust_Cardiac_Segmentation_Using_Graph_Convolutional_Networks.pdf",
        "title": "Toward Robust Cardiac Segmentation Using Graph Convolutional Networks",
        "authors": "Van De Vyver, Thomas, Ben-Yosef, Olaisen, Dalen, Løvstakken, Smistad",
        "venue": "IEEE Access, vol. 12",
        "year": 2024,
        "kind": "Journal article",
        "url": "https://doi.org/10.1109/ACCESS.2024.3373046",
        "topics": ["segmentation", "graph neural networks", "robustness", "anatomical correctness"],
    },
    {
        "id": "quality-umb",
        "file": "1-s2.0-S0301562924004691-main.pdf",
        "title": "Regional Image Quality Scoring for 2-D Echocardiography Using Deep Learning",
        "authors": "Van De Vyver, Måsøy, Dalen, Grenne, Holte, Olaisen, Nyberg, Østvik, Løvstakken, Smistad",
        "venue": "Ultrasound in Medicine & Biology, vol. 51(4)",
        "year": 2025,
        "kind": "Journal article",
        "url": "https://doi.org/10.1016/j.ultrasmedbio.2024.12.008",
        "topics": ["image quality", "coherence", "clinical measurements", "inter-observer variability"],
    },
    {
        "id": "quality-arxiv",
        "file": "2408.00591v5.pdf",
        "title": "Regional quality estimation for echocardiography using deep learning",
        "authors": "Van De Vyver, Måsøy, Dalen, Grenne, Holte, Olaisen, Nyberg, Østvik, Løvstakken, Smistad",
        "venue": "arXiv:2408.00591 (extended preprint)",
        "year": 2024,
        "kind": "Preprint",
        "url": "https://arxiv.org/abs/2408.00591",
        "topics": ["image quality", "coherence", "GCNR", "clinical measurements"],
    },
    {
        "id": "diffusion",
        "file": "s41598-025-21938-y.pdf",
        "title": "Generative augmentations for improved cardiac ultrasound segmentation using diffusion models",
        "authors": "Van De Vyver, Lenz, Smistad, Olaisen, Grenne, Holte, Dalen, Løvstakken",
        "venue": "Scientific Reports, vol. 15",
        "year": 2025,
        "kind": "Journal article",
        "url": "https://doi.org/10.1038/s41598-025-21938-y",
        "topics": ["diffusion models", "data augmentation", "generative AI", "segmentation", "domain shift"],
    },
    {
        "id": "pipeline",
        "file": "ztaf108.pdf",
        "title": "A deep learning-based pipeline for large-scale echocardiography data curation and measurements",
        "authors": "Hu, Olaisen, Pasdeloup, Van De Vyver, Østvik, Holte, Grenne, Smistad, Løvstakken, Dalen",
        "venue": "European Heart Journal - Digital Health, vol. 6",
        "year": 2025,
        "kind": "Journal article",
        "url": "https://doi.org/10.1093/ehjdh/ztaf108",
        "topics": ["data curation", "clinical measurements", "HUNT4", "large-scale pipeline"],
    },
    {
        "id": "lightweight",
        "file": "lightweight_segmentation_for_echocardiography.pdf",
        "title": "Lightweight image segmentation for echocardiography",
        "authors": "Kjelsrud, Løvstakken, Smistad, Van De Vyver",
        "venue": "Conference paper",
        "year": 2025,
        "kind": "Conference paper",
        "url": None,
        "topics": ["nnU-Net", "efficiency", "model compression", "segmentation"],
    },
    {
        "id": "thesis",
        "file": "PhD_thesis.pdf",
        "title": "Reliable deep learning for echocardiographic image analysis (PhD thesis)",
        "authors": "Gilles Van De Vyver",
        "venue": "NTNU, Faculty of Medicine and Health Sciences",
        "year": 2025,
        "kind": "PhD thesis",
        "url": None,
        # Chapters 3-5 (p. 83-168) reproduce the GCN, regional-quality and
        # diffusion papers, which are indexed separately above.
        "pages": (1, 82),
        "topics": ["overview", "background", "research questions", "ultrasound physics", "deep learning background"],
    },
]

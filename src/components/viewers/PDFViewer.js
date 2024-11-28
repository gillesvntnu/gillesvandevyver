import React, { useState } from 'react';
import { Worker, Viewer } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';
import pdf_file from '../../other/Recommendation_letter_Sam_Michiels.pdf';

const PDFViewer = () => {
    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);

    const onDocumentLoadSuccess = ({ numPages }) => {
        setNumPages(numPages);
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
            <div style={{ width: '61.8%' }}>
                <Worker workerUrl={`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`}>
                    <Viewer
                        fileUrl={pdf_file}
                        onLoadSuccess={onDocumentLoadSuccess}
                        renderMode="canvas"
                        scale={1}
                        cMapUrl="https://unpkg.com/pdfjs-dist@2.6.347/cmaps/"
                    />
                </Worker>
            </div>
        </div>
    );
};

export default PDFViewer;
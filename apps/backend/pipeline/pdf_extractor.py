"""
PDF extractor.

Extracts text from PDF files using pdftotext, pdfminer, and OCR as fallback.
"""

import os
import logging
import subprocess
from typing import Optional, Dict
from pathlib import Path

from .extractor import FieldResult, ExtractionResult, CONFIDENCE_SCORES

logger = logging.getLogger(__name__)


class PDFExtractor:
    """Extracts text from PDF files."""
    
    def __init__(self):
        self.has_pdftotext = self._check_pdftotext()
        self.has_tesseract = self._check_tesseract()
    
    def _check_pdftotext(self) -> bool:
        """Check if pdftotext is available."""
        try:
            subprocess.run(['pdftotext', '-v'], capture_output=True, check=True)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False
    
    def _check_tesseract(self) -> bool:
        """Check if Tesseract OCR is available."""
        try:
            subprocess.run(['tesseract', '--version'], capture_output=True, check=True)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False
    
    async def extract_from_pdf(self, pdf_path: str, url: str) -> ExtractionResult:
        """
        Extract text from PDF and create extraction result.
        
        Args:
            pdf_path: Path to PDF file
            url: Source URL
        
        Returns:
            ExtractionResult with extracted text
        """
        result = ExtractionResult(url, pipeline_version="1.0.0")
        
        # Try extraction methods in order
        text = None
        
        # Method 1: pdftotext (fastest, most reliable)
        if self.has_pdftotext:
            text = self._extract_with_pdftotext(pdf_path)
        
        # Method 2: pdfminer.six (Python library)
        if not text:
            text = self._extract_with_pdfminer(pdf_path)
        
        # Method 3: OCR with Tesseract (last resort)
        if not text and self.has_tesseract:
            text = self._extract_with_ocr(pdf_path)
        
        if text:
            # Extract fields from text using heuristics
            # This is a simplified version - in production, you'd use the full pipeline
            result.set_field('description', FieldResult(
                value=text[:5000],  # Limit description size
                source='pdf',
                confidence=CONFIDENCE_SCORES.get('heuristic', 0.6),
                raw_snippet=text[:500]
            ))
        
        result.is_job = True  # Assume PDFs are job postings
        result.classifier_score = 0.7
        
        return result
    
    def _extract_with_pdftotext(self, pdf_path: str) -> Optional[str]:
        """Extract text using pdftotext."""
        try:
            result = subprocess.run(
                ['pdftotext', pdf_path, '-'],
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                return result.stdout
        except Exception as e:
            logger.debug(f"pdftotext failed: {e}")
        return None
    
    def _extract_with_pdfminer(self, pdf_path: str) -> Optional[str]:
        """Extract text using pdfminer.six."""
        try:
            from pdfminer.high_level import extract_text
            text = extract_text(pdf_path)
            return text if text.strip() else None
        except ImportError:
            logger.debug("pdfminer.six not available")
        except Exception as e:
            logger.debug(f"pdfminer extraction failed: {e}")
        return None
    
    def _extract_with_ocr(self, pdf_path: str) -> Optional[str]:
        """Extract text using Tesseract OCR."""
        try:
            # Convert PDF to image first (requires pdf2image)
            from pdf2image import convert_from_path
            images = convert_from_path(pdf_path, dpi=200)
            
            text_parts = []
            for img in images:
                # Save temp image
                temp_img = f"/tmp/pdf_page_{hash(img)}.png"
                img.save(temp_img)
                
                # Run OCR
                result = subprocess.run(
                    ['tesseract', temp_img, 'stdout'],
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                if result.returncode == 0:
                    text_parts.append(result.stdout)
                
                # Cleanup
                os.remove(temp_img)
            
            return '\n'.join(text_parts) if text_parts else None
        except ImportError:
            logger.debug("pdf2image or pytesseract not available")
        except Exception as e:
            logger.debug(f"OCR extraction failed: {e}")
        return None


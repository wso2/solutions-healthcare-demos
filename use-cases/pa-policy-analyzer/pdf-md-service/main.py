import tempfile
import uvicorn
import pymupdf4llm
from fastapi import FastAPI, HTTPException, File, UploadFile

app = FastAPI()


@app.post("/v1/convert")
def convert_pdf_to_md(file: UploadFile = File(...)) -> dict:
    try:
        file_bytes = file.file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as temp_pdf:
            temp_pdf.write(file_bytes)
            temp_pdf.flush()
            md_text: str = pymupdf4llm.to_markdown(temp_pdf.name)

        return {"markdown": md_text}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=6093)

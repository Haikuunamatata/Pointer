import uvicorn

if __name__ == "__main__":
    uvicorn.run("file_server:app", 
                host="127.0.0.1", 
                port=23816, 
                reload=True,
                reload_dirs=["backend"])
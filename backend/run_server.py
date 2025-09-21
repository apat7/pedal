#!/usr/bin/env python3
"""
Production server runner for the eco-friendly navigation backend.
This script starts the FastAPI server with proper error handling and fallbacks.
"""

import sys
import os
import uvicorn
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.absolute()
sys.path.insert(0, str(backend_dir))

def main():
    """Start the FastAPI server"""
    print("=" * 60)
    print("ECO-FRIENDLY NAVIGATION BACKEND SERVER")
    print("=" * 60)
    print("Starting server...")
    print("Note: Initial data loading may take several minutes on first startup")
    print("The server will be available at: http://localhost:8000")
    print("API documentation: http://localhost:8000/docs")
    print("=" * 60)
    
    try:
        # Start the server
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=8000,
            reload=False,  # Disabled due to lifespan initialization
            log_level="info",
            access_log=True
        )
    except KeyboardInterrupt:
        print("\nServer stopped by user")
    except Exception as e:
        print(f"Server error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
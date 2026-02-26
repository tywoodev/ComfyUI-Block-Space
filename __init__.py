import os
import shutil
import folder_paths

# Tell ComfyUI to serve the files inside our "/web" directory
WEB_DIRECTORY = "./web"

# We are not adding any custom backend processing nodes yet, 
# so we leave the mappings empty.
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

__all__ = ["WEB_DIRECTORY", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
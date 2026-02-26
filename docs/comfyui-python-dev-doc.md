# ComfyUI Custom Node Development: Python Backend Handbook
**Target Audience:** AI Coding Agents & Backend Developers  
**Purpose:** Technical reference for extending the ComfyUI execution server via Python.

---

## 1. The Core Execution Model
ComfyUI's backend is a Directed Acyclic Graph (DAG) execution engine. It does not run scripts linearly; it resolves dependencies from the final output nodes backwards, then executes forwards.


* Nodes are defined as Python classes.
* Nodes act purely as data processors: they receive inputs, perform operations (usually PyTorch tensor math), and return outputs.
* State should strictly be avoided across executions unless explicitly managed via caching (`IS_CHANGED`).

---

## 2. Node Class Anatomy (The Boilerplate)
Every ComfyUI Python node requires a specific structural contract. 

```python
class MyCustomNode:
    # 1. Define inputs
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "intensity": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 10.0, "step": 0.1}),
            },
            "optional": {
                "mask": ("MASK",),
            },
            "hidden": {
                "prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"
            }
        }

    # 2. Define outputs
    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("filtered_image", "status_text")
    
    # 3. Define the execution function name
    FUNCTION = "process_image"

    # 4. Node category in the UI menu
    CATEGORY = "MyExtensions/Filters"

    # 5. The actual execution logic
    def process_image(self, image, intensity, mask=None, prompt=None, extra_pnginfo=None):
        # ... logic ...
        return (processed_image, "Success") # MUST return a tuple

```

---

## 3. The `INPUT_TYPES` Dictionary

The `INPUT_TYPES` classmethod dictates both the required backend variables and how the frontend renders the node's UI.

### Data Types & UI Widgets

* **Links (Wires):** Defined as a single-element tuple: `("IMAGE",)` or `("MODEL",)`. The frontend will render this as an input port.
* **Primitive Widgets:** If the tuple contains a dictionary, the frontend renders it as an interactive widget.
* `("INT", {"default": 0, "min": -2147483648, "max": 2147483647, "step": 1})` -> Slider/Number field.
* `("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01})` -> Slider/Number field.
* `("STRING", {"default": "text", "multiline": True})` -> Text box.
* `(["option1", "option2"],)` -> A dropdown combo box.


* **Hidden Inputs:** Used to silently pass graph data to the node without UI ports.
* `"PROMPT"`: Passes the entire raw JSON prompt execution dictionary.
* `"EXTRA_PNGINFO"`: Passes metadata bound to the workflow (useful for saving metadata into output images).
* `"UNIQUE_ID"`: Passes the specific node's ID as a string.



---

## 4. Tensor Formatting Rules (Crucial)

ComfyUI enforces strict dimensional standards for PyTorch tensors passed between nodes.

* **`IMAGE` Tensors:** Must be formatted as `[Batch, Height, Width, Channels]` (BHWC).
* Values are strictly normalized `torch.float32` between `0.0` and `1.0`.
* If wrapping external code that expects `BCHW`, you must `permute` the tensor before returning it.


* **`MASK` Tensors:** Must be formatted as `[Batch, Height, Width]` (BHW).
* Usually `torch.float32` with values `0.0` to `1.0`.


* **`LATENT` Dictionaries:** The "LATENT" type is a dictionary containing the tensor: `{"samples": latent_tensor}`. The tensor itself is `[Batch, Channels, Height, Width]`.

---

## 5. Execution Flags & Caching

### The `IS_CHANGED` Method

ComfyUI aggressively caches executions. If the inputs to a node haven't changed since the last run, ComfyUI skips executing it. To force a node to re-evaluate (e.g., for random number generation or reading a file that might have changed on disk), implement `IS_CHANGED`.

```python
    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Return float("NaN") to force execution every time
        return float("NaN") 
        # OR return a hash of a file to only update when the file changes

```

### The `OUTPUT_NODE` Flag

If a node is an endpoint that does not pass data further down the graph (like `SaveImage`), you must add `OUTPUT_NODE = True` to the class. If an execution path does not terminate in an `OUTPUT_NODE`, ComfyUI will prune it and skip execution entirely.

```python
class MySaveNode:
    OUTPUT_NODE = True
    # ...

```

---

## 6. Registration (`__init__.py`)

To expose your Python classes to the ComfyUI server, you must map them in your extension's `__init__.py` file.

```python
from .my_node_file import MyCustomNode

NODE_CLASS_MAPPINGS = {
    # Key is the internal identifier, Value is the Python Class
    "MyUniqueNodeIdentifier": MyCustomNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    # Key is the internal identifier, Value is the friendly name shown in the UI
    "MyUniqueNodeIdentifier": "My Custom Image Filter"
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]

```

---

## 7. Development Standing Orders

1. **Always Return Tuples:** The `execute` function must *always* return a tuple, even if `RETURN_TYPES` only specifies a single output type: `return (tensor_result,)`
2. **Non-Destructive Operations:** Never modify an input tensor in-place (`tensor.add_()` or `tensor *= 2`). Always clone it or return a new tensor. ComfyUI passes references; mutating an input tensor will corrupt other branches of the graph.
3. **Device Management:** Use `comfy.model_management.get_torch_device()` to ensure tensors are moved to the correct hardware (GPU/CPU/MPS) safely.

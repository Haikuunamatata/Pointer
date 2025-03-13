def test_function():
    # This will display output in the terminal
    print("Hello, world!")
    print("Testing Python function...")
    
    # The assertion will pass silently
    assert 1 + 1 == 2
    
    # Show some calculation results
    result = sum(range(1, 11))
    print(f"Sum of numbers 1-10: {result}")
    
    return "Function executed successfully"

# Flush print buffer to ensure output appears immediately
import sys
print("Starting test function...", flush=True)

# Call the function and capture the return value
return_value = test_function()
print(f"Return value: {return_value}", flush=True)

# Add more flush calls to ensure output is visible
print("Test complete!", flush=True) 
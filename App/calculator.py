import tkinter as tk
from tkinter import ttk

class Calculator:
    def __init__(self, root):
        self.root = root
        self.root.title('Simple Calculator')
        self.result_var = tk.StringVar()
        self.create_widgets()

    def create_widgets(self):
        entry = ttk.Entry(self.root, textvariable=self.result_var, font=('Arial', 20), justify='right')
        entry.grid(row=0, column=0, columnspan=4, sticky='nsew')

        buttons = [
            ('7', 1, 0), ('8', 1, 1), ('9', 1, 2), ('/', 1, 3),
            ('4', 2, 0), ('5', 2, 1), ('6', 2, 2), ('*', 2, 3),
            ('1', 3, 0), ('2', 3, 1), ('3', 3, 2), ('-', 3, 3),
            ('0', 4, 0), ('.', 4, 1), ('=', 4, 2), ('+', 4, 3),
        ]

        for (text, row, col) in buttons:
            action = lambda x=text: self.on_button_click(x)
            ttk.Button(self.root, text=text, command=action).grid(row=row, column=col, sticky='nsew')

        for i in range(5):
            self.root.rowconfigure(i, weight=1)
        for j in range(4):
            self.root.columnconfigure(j, weight=1)

    def on_button_click(self, char):
        if char == '=':
            try:
                expression = self.result_var.get()
                result = eval(expression)
                self.result_var.set(str(result))
            except:
                self.result_var.set('Error')
        else:
            current_text = self.result_var.get()
            self.result_var.set(current_text + char)

if __name__ == '__main__':
    root = tk.Tk()
    calculator = Calculator(root)
    root.mainloop()

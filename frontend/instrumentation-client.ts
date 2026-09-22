function isEthereumRedefineError(message: unknown): boolean {
  return (
    typeof message === "string" &&
    message.includes("Cannot redefine property: ethereum")
  );
}

window.addEventListener(
  "error",
  (event) => {
    if (isEthereumRedefineError(event.message)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true
);

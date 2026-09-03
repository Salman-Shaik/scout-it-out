const Overlay = ({ children, showOverlay }) => {
  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      style={{ display: showOverlay ? "block" : "none" }}
    >
      {children}
    </div>
  );
};

export default Overlay;

const Overlay = ({ children, showOverlay, labelledBy }) => {
  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      style={{ display: showOverlay ? "block" : "none" }}
    >
      {children}
    </div>
  );
};

export default Overlay;

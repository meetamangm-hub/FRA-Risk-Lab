# Optional benchmark (enables beta)

Add a file named `benchmark.csv` in this folder with two columns, ISO dates ascending:

    Date,Close
    2008-01-01,6179.10
    2008-01-02,6144.35

(Nifty 50 from Yahoo Finance `^NSEI` or niftyindices.com works.) Commit, push, and the site picks it up
automatically; beta then appears on every page. Without the file, beta shows "n/a" and nothing is estimated.

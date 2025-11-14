/* Stroke.js
- Stores Points + Color + Data
- This is the base of all drawing
- Draws a smooth, curved polyline
- I did not consult AI for this file.
- The reference guide https://p5js.org/reference/ was helpful for functions.
*/
class Stroke {
    // Creates new stroke with chosen color and thickness
    constructor(col, thickness = 4, opacity = 100, eraser = false) {
        this.col = col;              // color of stroke
        this.thickness = thickness;  // line thickness in pixels
        this.opacity = opacity;      // line opacity (0-100)
        this.points = [];            // list of points {x , y} that form the stroke
        this.eraser = eraser;        // if true, this stroke erases pixels
    }

    // Adds a new point (x, y) to the stroke while mouse is being dragged
    add(x, y) {
        this.points.push({ x, y });
    }

    // Draws the stroke on canvas
    draw(p) {
        // Draw nothing if not enough points
        if (this.points.length < 2) return;

        // Set Drawing style
        if (this.eraser) {
            // Remove pixels
            p.erase();
            p.stroke(0 ,0, 100);
        } else {
            p.noErase();
            p.stroke(this.col); // line color
        }
        p.noFill();                       // no fill
        p.strokeWeight(this.thickness);   // line thickness
        p.strokeCap(p.ROUND);             // rounded line ends
        p.strokeJoin(p.ROUND);            // rounded line joints

        // Begin Shape
        p.beginShape();
        for (const pt of this.points) {
            p.curveVertex(pt.x, pt.y); // add curve vertex at point
        }
        p.endShape(); // end shape

        if (this.eraser) p.noErase();
    }
}

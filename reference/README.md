# Orthogonal Connectors

This algorithm returns the points that form an [orthogonal](https://en.wikipedia.org/wiki/Orthogonality) path between two rectangles.

## How to Use

```javascript
// Define shapes
const shapeA = {left: 50,  top: 50, width: 100, height: 100};
const shapeB = {left: 200, top: 200, width: 50, height: 100};

// Get the connector path
const path = OrthogonalConnector.route({
    pointA: {shape: shapeA, side: 'bottom', distance: 0.5},
    pointB: {shape: shapeB, side: 'right',  distance: 0.5},
    shapeMargin: 10,
    globalBoundsMargin: 100,
    globalBounds: {left: 0, top: 0, width: 500, height: 500},
});

// Draw shapes and path
const context = document.getElementById('canvas').getContext('2d');
const {x, y} = path.shift();

// Draw shapes
context.strokeRect(shapeA.left, shapeA.top, shapeA.width, shapeA.height);
context.strokeRect(shapeB.left, shapeB.top, shapeB.width, shapeB.height);

// Draw path
context.beginPath();
context.moveTo(x, y); path.forEach(({x, y}) => context.lineTo(x, y));
context.stroke();
```

# Quick API

Only one method is exposed:

```javascript
OrthogonalConnector.route(routeOptions)
```

Given two shapes represented by its bounding rectangles, provides an array of `{x, y}` coordinates that route an orthogonal path between them.

In order to properly create the routing, you must specify a `side` and a `distance` for both the origin and destination points.

## `RouteOptions`

Options to pass to the `route` method. All fields are required.

|Property|Type|Description|
|---|---|---|
|pointA|[ConnectorPoint](#connectorpoint)|Origin point of connector
|pointB|[ConnectorPoint](#connectorpoint)|Destination point of connector
|shapeMargin|number|Margin around shapes for routing
|globalBoundsMargin|number|Margin that routing expands
|globalBounds|[Rect](#rect)|Defines confinement bounds

## `ConnectorPoint`

Represents either the source or the destination points of the route.

|Property|Type|Description|
|---|---|---|
|shape|[Rect](#rect)|Bounds of shape representing the point
|side|top,right,bottom,left|Side where the connector departs/arrives
|distance|number|From 0 to 1, to calculate the connector departure/arrival relative to the edge this point represents

## `Rect`

Represents a rectangle.

|Property|Type|Description|
|---|---|---|
|left|number|Left coordinate of rectangle
|top|number|Top coordinate of rectangle
|width|number|Width of rectangle
|height|number|Height of rectangle


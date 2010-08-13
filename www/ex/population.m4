<html>
  <head>
    <meta http-equiv="content-type" content="text/html;charset=utf-8">
    <title>Polymaps - Population Density</title>
    <script type="text/javascript" src="../modernizr.min.js?1.5"></script>
    <script type="text/javascript" src="../polymaps.min.js?1.6.0"></script>
    <script type="text/javascript" src="../nns.min.js?1.1.0"></script>
    <style type="text/css">

@import url("../screen.css?0.9");
@import url("../style.css?1.6.0");
@import url("population.css?1.6.0");

#map {
  background: #E6E6E6;
}

.layer path {
  fill: none;
  vector-effect: non-scaling-stroke;
}

#county path {
  stroke: rgb(192, 192, 192);
  stroke-opacity: .25;
  shape-rendering: crispEdges;
}

#state path {
  stroke: #fff;
  stroke-width: 1.5px;
}

    </style>
  </head>
  <body>
    <div class="container">
      <hr class="space"/>
      <div class="span-5 append-1 logo">
        <a href="../">
          <img src="../logo-small.png"/>
          <script type="text/javascript" src="../logo-small.js"></script>
        </a>
      </div>
      <div class="span-18 last top">
        <a href="../">Overview</a>
        <a class="active" href="./">Examples</a>
        <a href="../docs/">Documentation</a>
        <a href="http://github.com/simplegeo/polymaps">Download</a>
      </div>
      <hr class="space"/>
      <div id="map" class="span-24 last"></div>
      <hr class="space"/>
      <div id="copy" class="span-5 append-1">
        &copy; 2010
        <a href="http://www.cloudmade.com/">CloudMade</a>,
        <a href="http://www.openstreetmap.org/">OpenStreetMap</a> contributors,
        <a href="http://creativecommons.org/licenses/by-sa/2.0/">CCBYSA</a>.
        Colors by <a href="http://colorbrewer.org/">Cynthia Brewer</a>.
      </div>
      <div class="span-18 last">

m4_include(`../../examples/population/population.js.html')

      </div>
      <script type="text/javascript">

m4_include(`../../examples/population/population.js.txt')

      </script>
      <div class="span-5 append-1 credits">
        Polymaps is a project
        from <a class="bold" href="http://simplegeo.com/">SimpleGeo</a>
        and <a class="bold" href="http://stamen.com/">Stamen</a>.
      </div>
    </div>
  </body>
</html>

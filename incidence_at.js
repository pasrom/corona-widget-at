// Lizenz: AGES Dashboard COVID19 AT
// Use 3-digit GKZ (third row of https://covid19-dashboard.ages.at/data/CovidFaelle_Timeline_GKZ.csv).
// Widget Parameter: "204,KFL;312;706" for Klagenfurt Land (shown as KFL), Korneuburg and Landeck
//
// Based on the german variant:
// - kevinkub https://gist.github.com/kevinkub/46caebfebc7e26be63403a7f0587f664
// - Baumchen https://gist.github.com/Baumchen/6d91df0a4c76c45b15576db0632e4329
//
// No guarantee on correctness and completeness of the information provided.
const apiUrl = "https://covid19-dashboard.ages.at/data/CovidFaelle_Timeline_GKZ.csv"
const apiUrlTimeline = "https://covid19-dashboard.ages.at/data/CovidFaelle_Timeline.csv"
const apiRValues = "https://script.google.com/macros/s/AKfycbxBUvqznZNNlmebm2nYN5WlNoApjpoR22Jzduat5Qwi5gHnAd3d/exec"

const reverseGeocodingUrl = (location) => `https://nominatim.openstreetmap.org/search.php?q=${location.latitude.toFixed(3)}%2C%20${location.longitude.toFixed(3)}&polygon_geojson=1&format=jsonv2`
const jsonBKZData = "https://api.npoint.io/6b3942356a3ddcb584b3"

class LineChart {
  // LineChart by https://kevinkub.de/
  constructor(width, height, seriesA, seriesB) {
    this.ctx = new DrawContext();
    this.ctx.size = new Size(width, height);
    this.seriesA = seriesA;
    this.seriesB = seriesB;
  }
  _calculatePath(series, fillPath) {
    let maxValue = Math.max(...series);
    let minValue = Math.min(...series);
    let difference = maxValue - minValue;
    let count = series.length;
    let step = this.ctx.size.width / (count - 1);
    let points = series.map((current, index, all) => {
      let x = step * index;
      let y = this.ctx.size.height - (current - minValue) / difference * this.ctx.size.height;
      return new Point(x, y);
    });
    return this._getSmoothPath(points, fillPath);
  }
  _getSmoothPath(points, fillPath) {
    let path = new Path();
    path.move(new Point(0, this.ctx.size.height));
    path.addLine(points[0]);
    for (let i = 0; i < points.length - 1; i++) {
      let xAvg = (points[i].x + points[i + 1].x) / 2;
      let yAvg = (points[i].y + points[i + 1].y) / 2;
      let avg = new Point(xAvg, yAvg);
      let cp1 = new Point((xAvg + points[i].x) / 2, points[i].y);
      let next = new Point(points[i + 1].x, points[i + 1].y);
      let cp2 = new Point((xAvg + points[i + 1].x) / 2, points[i + 1].y);
      path.addQuadCurve(avg, cp1);
      path.addQuadCurve(next, cp2);
    }
    if (fillPath) {
      path.addLine(new Point(this.ctx.size.width, this.ctx.size.height));
      path.closeSubpath();
    }
    return path;
  }
  configure(fn) {
    let pathA = this._calculatePath(this.seriesA, true);
    let pathB = this._calculatePath(this.seriesB, false);
    if (fn) {
      fn(this.ctx, pathA, pathB);
    } else {
      this.ctx.addPath(pathA);
      this.ctx.fillPath(pathA);
      this.ctx.addPath(pathB);
      this.ctx.fillPath(pathB);
    }
    return this.ctx;
  }
}

const calcMode = {
  none: 0,
  incidence: 1,
  cases: 2,
};

function parseLocation(location) {
  const components = location.split(",")
  return {
    gkz: components[0],
    name: components.length >= 2 ? components[1] : null,
  }
}

function calc(data, location, nr = 0) {
  ctr = 0
  for (line of data) {
    const components = line.split(";")
    if (components[2] === location["gkz"]) {
      if (nr === ctr) {
        let fmt = new DateFormatter()
        fmt.dateFormat = 'dd.MM.yyyy HH:mm:ss'
        return {
          incidence: Math.round(parseFloat(components[6]) * (100000 / parseFloat(components[3]))),
          cases: parseFloat(components[4]),
          cured: parseFloat(components[10]),
          name: location["name"] ? location["name"] : components[1],
          date: fmt.date(components[0]),
        }
      }
      ctr++
    }
  }
  return {
    error: "GKZ unbekannt.",
  }
}

function calc2(data, location, row, nr = 0) {
  ctr = 0
  for (line of data) {
    const components = line.split(";")
    if (components[2] === location["gkz"]) {
      if (nr === ctr) {
          let fmt = new DateFormatter()
          fmt.dateFormat = 'dd.MM.yyyy HH:mm:ss'
          return {
            value: parseFloat(components[row]),
            date: fmt.date(components[0]),
          }
      }
      ctr++
    }
  }
  return {
    error: "GKZ unknown.",
  }
}

function getTimeline(data, location, nr) {
  var timeline = []
  for (line of data) {
    const components = line.split(";")
    if (components[2] === location["gkz"]) {
      timeline.push(parseFloat(components[nr]))
    }
  }
  return timeline
}

let widget = await createWidget()
if (!config.runsInWidget) {
  await widget.presentSmall()
}

Script.setWidget(widget)
Script.complete()

function getRegexedData(text, regex, nr) {
  var matched = []
  var matches = text.matchAll(regex)
  for (match of matches) {
    matched.push(match[nr])
  }
  return matched
}

function getRValues(data) {
  const regex = /e(\d,?\d*)/gm;
  const regex_data = /(Reproduktionszahl|Neuinfektionen){1} ((heute|gestern)? ?(\d\d\.\d\d\.\d\d\d\d)?(\d\d:\d\d)?)/gm;
  const regex_date = /(\d\d.\d\d.\d\d\d\d)/gm;
  matched = getRegexedData(data, regex, 1)
  matched2 = getRegexedData(data, regex_data, 0)

  let fmt = new DateFormatter()
  fmt.dateFormat = 'dd.MM.yyyy'

  matched3 = []
  for (var i = 0; i <= matched.length - 1; i++) {
    if (matched2[i].match(regex_date) == null) {
      date = new Date()
    } else {
      date = fmt.date(matched2[i].match(regex_date)[0])
    }
    if (matched2[i].includes("Reproduktionszahl")) {
      name = "R"
    } else if (matched2[i].includes("Neuinfektionen")) {
      name = "Cases"
    }
    tmp = {
      name: name,
      value: parseFloat(matched[i].replace(",", ".")),
      date: date,
    }
    matched3.push(tmp)
  }
  return matched3
}

async function getLocation() {
  try {
    Location.setAccuracyToThreeKilometers()
    return await Location.current()
  } catch (e) {
    return null;
  }
}

async function getBKZNumber(url, location) {
  const act_location = await getLocation();
  let discrictFromGps = await new Request(reverseGeocodingUrl(act_location)).loadJSON()
  let BKZData = await new Request(url).loadJSON()
  tmp = discrictFromGps[0].display_name
  reg = /Bezirk (.*?),/
  discrict = reg.exec(tmp)[1]
  actBKZ = 0
  for (var i = 0; i < BKZData.length; i++) {
    if (BKZData[i].Bezirk === discrict) {
      actBKZ = BKZData[i].BKZ + "," + BKZData[i].KFZ
      break
    }
  }
  return actBKZ
}

async function createWidget(items) {
  const list = new ListWidget()
  list.setPadding(10, 10, 0, 0)
  if (args.widgetParameter) {
    parameter = args.widgetParameter
  } else {
    parameter = "802,B;803,DO;804,FK"
  }

  try {
    BKZNr = await getBKZNumber(jsonBKZData) + ";"
  } catch (e) {
    BKZNr = ""
    log(e)
  }
  parameter = BKZNr  + parameter

  const locations = parameter.split(";").map(parseLocation)
  const loc = "10,🇦🇹".split(";").map(parseLocation)
  const apidata = await new Request(apiUrl).loadString()
  const apidata_lines = apidata.split("\n").reverse()

  const apidata_Timeline = await new Request(apiUrlTimeline).loadString()
  const apidata_Timeline_lines = apidata_Timeline.split("\n").reverse()

  const regex = /e(\d,?\d*)/gm;
  const regex2 = /(Reproduktionszahl|Neuinfektionen){1} ((heute|gestern)? ?(\d\d\.\d\d\.\d\d\d\d)?(\d\d:\d\d)?)/gm;
  const apidata_r = await new Request(apiRValues).loadString()
  matched3 = getRValues(apidata_r)

  const data_today = calc(apidata_Timeline_lines, loc[0])
  const data_yesterday = calc(apidata_Timeline_lines, loc[0], 1)

  data_timeline = []
  for (var i = 0; i < 4; i++) {
    data_timeline.push(calc(apidata_Timeline_lines, loc[0], i))
  }

  let day_month_formatter = new DateFormatter()
  day_month_formatter.dateFormat = "dd/MM"
  const infected_stack = list.addStack()
  infected_stack.layoutHorizontally()

  for (var i = 0; i < 3; i++) {
    const text_cases = data_timeline[i]["cases"] + " " + getTrendArrow(data_timeline[i + 1]["cases"], data_timeline[i]["cases"])
    const date_cases = `${data_timeline[i]["date"].getDate()}.${data_timeline[i]["date"].getMonth() + 1}.${data_timeline[i]["date"].getFullYear()}`
    var text_r = "N/A"
    for (var j = 0; j < matched3.length; j++) {
      date_r = `${matched3[j]["date"].getDate()}.${matched3[j]["date"].getMonth() + 1}.${matched3[j]["date"].getFullYear()}`
      if (date_cases === date_r && matched3[j]["name"] === "R") {
        text_r = matched3[j]["value"]
        break
      }
    }
    const date_infected = infected_stack.addText(
      day_month_formatter.string(data_timeline[i]["date"]) + "\n" +
      text_cases + "\n" +
      text_r
    )
    date_infected.font = Font.mediumSystemFont(10)
    date_infected.centerAlignText()
    infected_stack.addSpacer()
  }
  list.addSpacer(5)
  const incidence_stack = list.addStack()
  incidence_stack.layoutVertically()
  incidence_stack.useDefaultPadding()
  const header = incidence_stack.addText("🦠 Incidence " + day_month_formatter.string(data_today["date"]))
  header.font = Font.mediumSystemFont(11)
  incidence_stack.addSpacer(2)

  const line = incidence_stack.addStack()
  line.layoutHorizontally()
  line.useDefaultPadding()

  // show incidence for austria
  printIncidence(line, data_today, data_today["name"])

  // show incidence for given districts
  ctr = 0
  for (location of locations) {
    // do not print if it's the same as the actual location
    if (locations[0]["gkz"] === location["gkz"] && ctr != 0) {
      continue
    }
    const data = calc(apidata_lines, location)
    const data_yesterday_2 = calc(apidata_lines, location, 1)
    if (data["error"]) {
      list.addText(data["error"])
      continue
    }
    printIncidence(line, data, data_yesterday_2)
    ctr++
  }
  list.addSpacer(5)

  data_infected = []
  for (var i = 0; i < 2; i++) {
    let data_cases_sum_today = calc2(apidata_Timeline_lines, loc[0], 5, i)
    let data_cases_cured_sum_today = calc2(apidata_Timeline_lines, loc[0], 11, i)
    tmp = {
      value: data_cases_sum_today["value"] - data_cases_cured_sum_today["value"],
      date: data_cases_sum_today["date"],
    }
    data_infected.push(tmp)
  }
  printActiveCases(list, data_infected[0], data_infected[1])
  list.addSpacer()

  let data = getTimeline(apidata_Timeline_lines, loc[0], 4).reverse()
  let sumCases = getTimeline(apidata_Timeline_lines, loc[0], 6).reverse()
  let sumCured = getTimeline(apidata_Timeline_lines, loc[0], 12).reverse()
  let infected = sumCases.filter(x => !sumCured.includes(x));

  let chart = new LineChart(800, 800, data, infected).configure((ctx, pathA, pathB) => {
    ctx.opaque = false;
    ctx.setFillColor(new Color("888888", .5));
    ctx.addPath(pathA);
    ctx.fillPath(pathA);
    ctx.addPath(pathB);
    ctx.setStrokeColor(Color.white());
    ctx.setLineWidth(1)
    ctx.strokePath();
  }).getImage();
  list.backgroundImage = chart

  return list
}

function printActiveCases(stack, data, data_yesterday) {
  const line = stack.addStack()
  line.setPadding(0, 0, 0, 0)
  line.layoutVertically()
  const name = line.addText("🦠 active cases 🇦🇹")
  name.font = Font.mediumSystemFont(11)
  const label = line.addText(data["value"] + getTrendArrow(data_yesterday["value"], data["value"]))
  label.font = Font.boldSystemFont(11)
  label.textColor = Color.orange()
  label.centerAlignText()
}

function printIncidence(stack, data, data_yesterday) {
  value = data["incidence"]
  description = data["name"]
  const line = stack.addStack()
  line.setPadding(0, 0, 0, 0)
  line.layoutVertically()
  const label = line.addText(String(value) + getTrendArrow(data_yesterday["incidence"], data["incidence"]))
  label.font = Font.boldSystemFont(11)
  label.centerAlignText()

  if (value >= 50) {
    label.textColor = Color.red()
  } else if (value >= 35) {
    label.textColor = Color.orange()
  } else {
    label.textColor = Color.green()
  }

  stack.addSpacer(1)

  const name = line.addText(description)
  name.minimumScaleFactor = 0.3
  name.font = Font.systemFont(10)
  name.lineLimit = 1

  stack.addSpacer(2)
}

function getTrendArrow(preValue, currentValue) {
  return (currentValue <= preValue) ? '↓' : '↑'
}

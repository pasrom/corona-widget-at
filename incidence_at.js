// Lizenz: AGES Dashboard COVID19 AT
// Use 3-digit GKZ (third row of https://covid19-dashboard.ages.at/data/CovidFaelle_Timeline_GKZ.csv).
// Widget Parameter: "204,KFL;312;706" for Klagenfurt Land (shown as KFL), Korneuburg and Landeck
//
// Based on the german variant:
// - kevinkub https://gist.github.com/kevinkub/46caebfebc7e26be63403a7f0587f664
// - Baumchen https://gist.github.com/Baumchen/6d91df0a4c76c45b15576db0632e4329
//
// No guarantee on correctness and completeness of the information provided.
const urlTimelineGkz = "https://covid19-dashboard.ages.at/data/CovidFaelle_Timeline_GKZ.csv"
const urlTimeline = "https://covid19-dashboard.ages.at/data/CovidFaelle_Timeline.csv"
const urlRValues = "https://script.google.com/macros/s/AKfycby_a0nPXgDfca_SrnX1w6W8qpmjlSdmG9kMW25QnY-D8a4rfUU/exec"

const reverseGeocodingUrl = (location) => `https://nominatim.openstreetmap.org/search.php?q=${location.latitude.toFixed(3)}%2C%20${location.longitude.toFixed(3)}&polygon_geojson=1&format=jsonv2`
const jsonBKZData = "https://api.npoint.io/6b3942356a3ddcb584b3"

const widgetSizes = {
  small: { width: 465, height: 465 },
  medium: { width: 987, height: 465 },
  large: { width: 987, height: 1035 },
}

const useLogarithmicScale = true

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
          date: fmt.date(components[0]),
          state_district: location["name"] ? location["name"] : components[1],
          id: parseInt(components[2]),
          residents: parseInt(components[3]),
          cases_daily: parseInt(components[4]),
          cases_sum: parseInt(components[5]),
          cases_7_days: parseInt(components[6]),
          incidence_7_days: parseInt(components[7]),
          deaths_daily: parseInt(components[8]),
          deaths_sum: parseInt(components[9]),
          cured_daily: parseInt(components[10]),
          cured_sum: parseInt(components[11]),
          active_cases_sum: parseInt(components[5]) - parseInt(components[11]),
        }
      }
      ctr++
    }
  }
  return {
    error: "GKZ unbekannt.",
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

const widgetSize = widgetSizes[config.widgetFamily] ?? widgetSizes.small
let widget = await createWidget(widgetSize)
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
  matched_data = getRegexedData(data, regex, 1)
  matched_date = getRegexedData(data, regex_data, 0)

  let fmt = new DateFormatter()
  fmt.dateFormat = 'dd.MM.yyyy'

  r_values = []
  for (var i = 0; i <= matched_data.length - 1; i++) {
    if (matched_date[i].match(regex_date) == null) {
      date = new Date()
    } else {
      date = fmt.date(matched_date[i].match(regex_date)[0])
    }
    if (matched_date[i].includes("Reproduktionszahl")) {
      name = "R"
    } else if (matched_date[i].includes("Neuinfektionen")) {
      name = "Cases"
    }
    tmp = {
      name: name,
      value: parseFloat(matched_data[i].replace(",", ".")),
      date: date,
    }
    r_values.push(tmp)
  }
  return r_values
}

async function getLocation() {
  try {
    Location.setAccuracyToThreeKilometers()
    return await Location.current()
  } catch (e) {
    return null;
  }
}

async function getBkzNumber(url, location) {
  const act_location = await getLocation();
  let discrict_from_gps = await new Request(reverseGeocodingUrl(act_location)).loadJSON()
  let BKZData = await new Request(url).loadJSON()
  tmp = discrict_from_gps[0].display_name
  reg = /Bezirk (.*?),/
  disctrict = reg.exec(tmp)[1]
  act_bkz = 0
  for (var i = 0; i < BKZData.length; i++) {
    if (BKZData[i].Bezirk === disctrict) {
      act_bkz = BKZData[i].BKZ + "," + BKZData[i].KFZ
      break
    }
  }
  return act_bkz
}

async function createWidget(widgetSize) {
  const list = new ListWidget()
  list.setPadding(10, 10, 0, 0)
  if (args.widgetParameter) {
    parameter = args.widgetParameter
  } else {
    parameter = "802,B;803,DO;804,FK"
  }

  try {
    BKZNr = await getBkzNumber(jsonBKZData) + ";"
  } catch (e) {
    BKZNr = ""
    log(e)
  }
  parameter = BKZNr  + parameter

  const locations = parameter.split(";").map(parseLocation)
  const states = "10,🇦🇹".split(";").map(parseLocation)
  const req_timeline_gkz = await new Request(urlTimelineGkz).loadString()
  const timeline_gkz_lines = req_timeline_gkz.split("\n").reverse()

  const req_timeline = await new Request(urlTimeline).loadString()
  const timeline_lines = req_timeline.split("\n").reverse()

  const req_r_values = await new Request(urlRValues).loadString()
  r_values = getRValues(req_r_values)

  data_timeline = []
  for (var i = 0; i < 4; i++) {
    data_timeline.push(calc(timeline_lines, states[0], i))
  }

  let day_month_formatter = new DateFormatter()
  day_month_formatter.dateFormat = "dd/MM"
  const infected_stack = list.addStack()
  infected_stack.layoutHorizontally()

  for (var i = 0; i < 3; i++) {
    const text_cases = data_timeline[i]["cases_daily"] + " " + getTrendArrow(data_timeline[i + 1]["cases_daily"], data_timeline[i]["cases_daily"])
    const date_cases = `${data_timeline[i]["date"].getDate()}.${data_timeline[i]["date"].getMonth() + 1}.${data_timeline[i]["date"].getFullYear()}`
    var text_r = "N/A"
    for (var j = 0; j < r_values.length; j++) {
      date_r = `${r_values[j]["date"].getDate()}.${r_values[j]["date"].getMonth() + 1}.${r_values[j]["date"].getFullYear()}`
      if (date_cases === date_r && r_values[j]["name"] === "R") {
        text_r = r_values[j]["value"]
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

  // add stack for the 7 day incidence
  const stack_incidence = list.addStack()
  stack_incidence.layoutVertically()
  stack_incidence.useDefaultPadding()
  const header = stack_incidence.addText("🦠 7-day-incidence")
  header.font = Font.mediumSystemFont(11)
  stack_incidence.addSpacer(2)
  const stack_incidence_print = stack_incidence.addStack()
  stack_incidence_print.layoutHorizontally()
  stack_incidence_print.useDefaultPadding()
  stack_incidence.addSpacer(5)

  // add stack for the active cases
  const stack_infected = list.addStack()
  stack_infected.setPadding(0, 0, 0, 0)
  stack_infected.layoutVertically()
  const name = stack_infected.addText("🦠 active cases")
  name.font = Font.mediumSystemFont(11)
  stack_infected.addSpacer(2)
  const stack_infected_print = stack_infected.addStack()
  stack_infected_print.layoutHorizontally()
  stack_infected_print.useDefaultPadding()
  stack_infected.addSpacer(5)

  // show incidence for austria
  printIncidence(stack_incidence_print, data_timeline[0], data_timeline[1])
  // show active cases for austria
  printActiveCases(stack_infected_print, data_timeline[0], data_timeline[1])

  // show incidence and active cases for given districts
  let ctr = 0
  for (location of locations) {
    // do not print if it's the same as the actual location
    if (locations[0]["gkz"] === location["gkz"] && ctr != 0) {
      continue
    }
    const data_timeline_gkz = calc(timeline_gkz_lines, location)
    const data_timeline_gkz_yesterday = calc(timeline_gkz_lines, location, 1)
    printIncidence(stack_incidence_print, data_timeline_gkz, data_timeline_gkz_yesterday)
    if (ctr === 0) {
      printActiveCases(stack_infected_print, data_timeline_gkz, data_timeline_gkz_yesterday)
    }
    ctr++
  }
  list.addSpacer()

  let data = getTimeline(timeline_lines, states[0], 4).reverse()
  let sum_cases = getTimeline(timeline_lines, states[0], 6).reverse()
  let sum_cured = getTimeline(timeline_lines, states[0], 12).reverse()
  let infected = sum_cases.filter(x => !sum_cured.includes(x));
  
  if (useLogarithmicScale) {
    data = data.map(Math.log)
    infected = infected.map(Math.log)
  }

  let chart = new LineChart(widgetSize.width, widgetSize.height, data, infected).configure((ctx, pathA, pathB) => {
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
  description = data["state_district"]
  const line = stack.addStack()
  line.setPadding(0, 0, 0, 0)
  line.layoutVertically()
  const label = line.addText(data["active_cases_sum"] + getTrendArrow(data_yesterday["active_cases_sum"], data["active_cases_sum"]))
  label.font = Font.boldSystemFont(11)
  label.textColor = Color.orange()
  label.centerAlignText()

  stack.addSpacer(1)

  const name = line.addText(description)
  name.minimumScaleFactor = 0.3
  name.font = Font.systemFont(10)
  name.lineLimit = 1
  stack.addSpacer(2)
}

function printIncidence(stack, data, data_yesterday) {
  value = data["incidence_7_days"]
  description = data["state_district"]
  const line = stack.addStack()
  line.setPadding(0, 0, 0, 0)
  line.layoutVertically()
  const label = line.addText(String(value) + getTrendArrow(data_yesterday["incidence_7_days"], data["incidence_7_days"]))
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

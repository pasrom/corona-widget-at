// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: light-gray; icon-glyph: microscope;
// Lizenz: AGES Dashboard COVID19 AT
// Use 3-digit GKZ (third row of https://covid19-dashboard.ages.at/data/CovidFaelle_Timeline_GKZ.csv).
// Widget Parameter: "204,KFL;312;706" for Klagenfurt Land (shown as KFL), Korneuburg and Landeck
//
// Based on the german variant:
// - kevinkub https://gist.github.com/kevinkub/46caebfebc7e26be63403a7f0587f664
// - Baumchen https://gist.github.com/Baumchen/6d91df0a4c76c45b15576db0632e4329
//
// No guarantee on correctness and completeness of the information provided.
// Version 0.1.4

// user configuration
const useLogarithmicScale = true
const maxDaysDisplayed = {
  small: 3,
  medium: 7,
  large: 7,
}
// user configuration end

const urlTimelineAustria = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQldP8uIuZsfCQWIBUkgybPnIhTEbXlXk3xF2qW1hEOH3Qrh9F8340mXJj6SCGS_iTcUolVmwhwjphx/pub?gid=344127261&single=true&output=csv"
const urlTimelineGkz = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQldP8uIuZsfCQWIBUkgybPnIhTEbXlXk3xF2qW1hEOH3Qrh9F8340mXJj6SCGS_iTcUolVmwhwjphx/pub?gid=712549080&single=true&output=csv"
const urlTimeline = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQldP8uIuZsfCQWIBUkgybPnIhTEbXlXk3xF2qW1hEOH3Qrh9F8340mXJj6SCGS_iTcUolVmwhwjphx/pub?gid=0&single=true&output=csv"
const urlRSeries = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQldP8uIuZsfCQWIBUkgybPnIhTEbXlXk3xF2qW1hEOH3Qrh9F8340mXJj6SCGS_iTcUolVmwhwjphx/pub?gid=776589868&single=true&output=csv"
const urlActTimeline = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSMnBhOvoeZyV7UJSzTYD40Z4v4hG2JxJ2WH5jIHCWzBDzUOKsHQ1P1rVfgWt_WCgncMSsHvXThEULt/pub?gid=0&single=true&output=csv"
const urlVaccinations = "https://info.gesundheitsministerium.gv.at/data/timeline-eimpfpass.csv"

const reverseGeocodingUrl = (location) => `https://nominatim.openstreetmap.org/search.php?q=${location.latitude.toFixed(3)}%2C%20${location.longitude.toFixed(3)}&polygon_geojson=1&format=jsonv2`
const jsonBKZData = "https://api.npoint.io/8163b3aacafa8e541609"

const widgetSizes = {
  small: { width: 465, height: 465 },
  medium: { width: 987, height: 465 },
  large: { width: 987, height: 1035 },
}

let mediumWidget = (config.widgetFamily === 'medium') ? true : false

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

class DataResponse {
    constructor(data, status = 200) {
        this.data = data
        this.status = status
    }
}

const fileType = {
  json: ".json",
  csv: ".csv",
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
    var components = null
    if(line.search(";") >= 0) {
      components = line.split(";")
    } else {
      components = line.split(",")
    }
    if (components[2] === location["gkz"]) {
      if (nr === ctr) {
        var day = +components[0].substring(0,2)
        var month = +components[0].substring(3,5)
        var year = +components[0].substring(6,11)
        return {
          date: (new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))),
          state_district: location["name"] ? location["name"] : components[1],
          id: parseInt(components[2]),
          residents: parseInt(components[3]),
          cases_daily: parseInt(components[4]),
          cases_sum: parseInt(components[5]),
          cases_7_days: parseInt(components[6]),
          incidence_7_days: parseInt(components[7].split('\"').pop().split('\"')[0]),
          deaths_daily: parseInt(components[8]),
          deaths_sum: parseInt(components[9]),
          cured_daily: parseInt(components[10]),
          cured_sum: parseInt(components[11]),
          active_cases_sum: parseInt(components[5]) - parseInt(components[11]) - parseInt(components[9]),
        }
      }
      ctr++
    }
  }
  return {
    error: "GKZ unbekannt.",
  }
}

function calcR(data, nr = 0) {
    var components = null
    if(data[nr].search(";") >= 0) {
      components = data[nr].split(";")
    } else {
      components = data[nr].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
    }
    var day = +components[0].substring(8,10)
    var month = +components[0].substring(5,7)
    var year = +components[0].substring(0,4)
    return {
      date: (new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))),
      r_value: parseFloat(components[1].replace(',', '.').replaceAll('"', '')),
    }
}

function getVaccinations(data, location, nr = 0) {
  ctr = 0
  for (line of data) {
    var components = null
    if(line.search(";") >= 0) {
      components = line.split(";")
    } else {
      components = line.split(",")
    }
    if (components[1] === location["gkz"]) {
      if (nr === ctr) {
        var day = +components[0].substring(8,10)
        var month = +components[0].substring(5,7)
        var year = +components[0].substring(0,4)
        return {
          date: (new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))),
          state_district: location["name"] ? location["name"] : components[3],
          id: parseInt(components[1]),
          residents: parseInt(components[2]),
          registered_vaccinations: parseInt(components[4]),
          registered_vaccinations_100: parseFloat(components[9]),
          partly_vaccinated: parseInt(components[6]),
          partly_vaccinated_100: parseFloat(components[7]),
          fully_immunized: parseInt(components[8]),
          fully_immunized_100: parseFloat(components[9]),
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
    line = line.replaceAll('\r', '')
    const components = line.split(",")
    if (components[2] === location["gkz"]) {
      timeline.push(parseFloat(components[nr]))
    }
  }
  return timeline
}

var fm = getFilemanager()
let fmConfigDirectory = fm.joinPath(fm.documentsDirectory(), '/coronaWidget')
if (!fm.isDirectory(fmConfigDirectory)) fm.createDirectory(fmConfigDirectory)

const widgetSize = widgetSizes[config.widgetFamily] ?? widgetSizes.small
const daysDisplayed = maxDaysDisplayed[config.widgetFamily] ?? maxDaysDisplayed.small

let widget = await createWidget(widgetSize, daysDisplayed)
if (!config.runsInWidget) {
  if (mediumWidget) {
      await widget.presentMedium()
  } else {
      await widget.presentSmall()
  }
}

Script.setWidget(widget)
Script.complete()

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
  for (var i = 0; i < BKZData.length; i++) {
    if (BKZData[i].Bezirk === disctrict) {
      return BKZData[i].BKZ + "," + "📍" + BKZData[i].KFZ
    }
  }
  throw "No district <" + disctrict + "> could be matched with the current position!"
}

async function getCsvData(url, fileName, splitChar) {
  var error = 0
  var request = null
  var request_str = null
  try{
    request = new Request(url);
    request_str = await request.loadString()
  } catch (e) {
    error = -1
    log(e)
  }
  if (error >= 0 && request.response.statusCode != 200) {
    error = -1
    log("error " + request.response.statusCode + " getting " + url)
  }
  var re = /text\/csv|text\/plain/i;
  if (error >= 0 && !request.response.mimeType.match(re)) {
    error = -1
    log("Wrong mimeType " + request.response.mimeType + " from url " + url)
  }
  if (error >= 0){
    saveData(fileType.csv, fileName, request_str)
  } else {
    log("using offline data: " + fileName)
    let tmp = await loadData(fileType.csv, fileName)
    request_str = tmp.data
  }

  return request_str.split(splitChar).reverse()
}

async function createWidget(widgetSize, daysDisplayed) {
  const list = new ListWidget()
  let nextRefresh = Date.now() + 1000*30*60 // 30 min refresch rate
  list.refreshAfterDate = new Date(nextRefresh)
  list.setPadding(0, 0, 0, 0)
  list.addSpacer(5)

  if (args.widgetParameter) {
    parameter = args.widgetParameter
  } else {
    parameter = "802,B;8,Vbg."
  }
  /* remove last ';' if one is present */
  parameter = parameter.replace(/;\s*$/, "");

  try {
    BKZNr = await getBkzNumber(jsonBKZData) + ";"
  } catch (e) {
    BKZNr = ""
    log(e)
  }
  parameter = BKZNr  + parameter

  const locations = parameter.split(";").map(parseLocation)
  const states = "10,🇦🇹".split(";").map(parseLocation)

  const timeline_gkz_lines = await getCsvData(urlTimelineGkz, "Timeline_GKZ", "\n")
  const timeline_lines = await getCsvData(urlTimeline, "Timeline", "\n")
  const timeline_austria_lines = await getCsvData(urlTimelineAustria, "Timeline_Austria", "\n")
  const timeline2_lines = await getCsvData(urlActTimeline, "Timeline2", "\r\n")
  const r_series = await getCsvData(urlRSeries, "r-series", "\r\n")
  const vaccinations = await getCsvData(urlVaccinations, "Vaccinations", "\r\n")

  vaccinations_data = getVaccinations(vaccinations, states[0])

  const vaccinatons_stack = list.addStack()
  vaccinatons_stack.layoutHorizontally()
  vaccinatons_stack.setPadding(0, 0, 0, 0)
  vaccinatons_stack.addSpacer()
  vaccinations_label = vaccinatons_stack.addText("🇦🇹 " + vaccinations_data["registered_vaccinations"] + " | " + vaccinations_data["registered_vaccinations_100"].toFixed(2) + " 💉")
  vaccinations_label.font = Font.mediumSystemFont(10)
  vaccinatons_stack.addSpacer()
  list.addSpacer(5)

  var data_timeline = []
  for (var i = 0; i < daysDisplayed + 1; i++) {
    data_timeline.push(calc(timeline_lines, states[0], i))
  }
  var data_timeline_2 = []
  for (var i = 0; i < 3; i++) {
    data_timeline_2.push(calc(timeline2_lines, states[0], i))
  }

  data_timeline_2.reverse()
  var data_timeline_new = [...data_timeline]
  data_timeline_new.reverse()
  for (var k = 0; k < data_timeline_2.length; k++) {
    var date_source_2 = new Date(data_timeline_2[k]["date"].getFullYear(), data_timeline_2[k]["date"].getMonth(), data_timeline_2[k]["date"].getDate());
    var i = data_timeline_new.length - 1
    var date_source_1 = new Date(data_timeline_new[i]["date"].getFullYear(), data_timeline_new[i]["date"].getMonth(), data_timeline_new[i]["date"].getDate());
    if (date_source_2.getTime() > date_source_1.getTime()) {
      data_timeline_new.push(data_timeline_2[k])
    }
  }
  data_timeline_new.reverse()

  const infected_stack = list.addStack()
  infected_stack.layoutHorizontally()
  infected_stack.setPadding(0, 0, 0, 0)
  infected_stack.addSpacer()

  var temp = []
  for (var i = 0; i < daysDisplayed; i++) {
    const text_cases = data_timeline_new[i]["cases_daily"] + " " + getTrendArrow(data_timeline_new[i + 1]["cases_daily"], data_timeline_new[i]["cases_daily"])
    const date_cases = ('0' + data_timeline_new[i]["date"].getDate()).slice(-2) + '.'
             + ('0' + (data_timeline_new[i]["date"].getMonth() + 1)).slice(-2) + '.'
             + data_timeline_new[i]["date"].getFullYear();
    const text_date = `${data_timeline_new[i]["date"].getDate()}/${data_timeline_new[i]["date"].getMonth() + 1}`
    var text_r = "N/A"
    temp.push(calcR(r_series, i))
    for (var j = 0; j < temp.length; j++) {
      date_cases_r = ('0' + temp[j]["date"].getDate()).slice(-2) + '.'
        + ('0' + (temp[j]["date"].getMonth() + 1)).slice(-2) + '.'
        + temp[j]["date"].getFullYear();
      if (date_cases === date_cases_r) {
        text_r = String(temp[j]["r_value"].toFixed(2))
        break
      }
    }
    const date_infected = infected_stack.addText(
      text_date + "\n" +
      text_cases + "\n" +
      text_r
    )
    date_infected.font = Font.mediumSystemFont(10)
    date_infected.centerAlignText()
    infected_stack.addSpacer()
  }
  list.addSpacer(5)
  
  stack_incidence_print = createStackWithHeader(list, "🦠 7-day-incidence")
  stack_infected_print = createStackWithHeader(list, "🦠 active cases")

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
    if (location["gkz"] > 10) {
      const data_timeline_gkz = calc(timeline_gkz_lines, location)
      const data_timeline_gkz_yesterday = calc(timeline_gkz_lines, location, 1)
      printIncidence(stack_incidence_print, data_timeline_gkz, data_timeline_gkz_yesterday)
      if (ctr === 0 || mediumWidget) {
        printActiveCases(stack_infected_print, data_timeline_gkz, data_timeline_gkz_yesterday)
      }
    } else {
      const data_timeline_loc = calc(timeline_lines, location)
      const data_timeline_loc_yesterday = calc(timeline_lines, location, 1)
      printIncidence(stack_incidence_print, data_timeline_loc, data_timeline_loc_yesterday)
      printActiveCases(stack_infected_print, data_timeline_loc, data_timeline_loc_yesterday)
    }
    ctr++
  }
  stack_incidence_print.addSpacer()
  stack_infected_print.addSpacer()

  let data = getTimeline(timeline_austria_lines, states[0], 4).reverse()
  let sum_cases = getTimeline(timeline_austria_lines, states[0], 6).reverse()
  let sum_cured = getTimeline(timeline_austria_lines, states[0], 12).reverse()
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

function createStackWithHeader(list, header) {
  const stack_outline = list.addStack()
  stack_outline.setPadding(0, 0, 0, 0)
  stack_outline.layoutHorizontally()
  const stack = stack_outline.addStack()
  stack.setPadding(0, 0, 0, 0)
  stack.layoutVertically()
  const header_stack = stack.addStack()
  header_stack.layoutHorizontally()
  header_stack.addSpacer()
  const name = header_stack.addText(header)
  name.font = Font.mediumSystemFont(11)
  header_stack.addSpacer()
  stack.addSpacer(2)
  const stack_print = stack.addStack()
  stack_print.layoutHorizontally()
  stack_print.setPadding(0, 0, 0, 0)
  stack_print.addSpacer()
  list.addSpacer(5)
  return stack_print
}

function printActiveCases(stack, data, data_yesterday) {
  description = data["state_district"]

  const stack_outline = stack.addStack()
  stack_outline.setPadding(0, 0, 0, 0)
  stack_outline.layoutVertically()

  const line = stack_outline.addStack()
  line.setPadding(0, 0, 0, 0)
  line.layoutHorizontally()
  const label = line.addText(data["active_cases_sum"] + getTrendArrow(data_yesterday["active_cases_sum"], data["active_cases_sum"]))
  label.font = Font.boldSystemFont(11)
  label.textColor = Color.orange()
  label.centerAlignText()

  stack.addSpacer(1)

  const stack_text = stack_outline.addStack()
  stack_text.setPadding(0, 0, 0, 0)
  stack_text.layoutHorizontally()
  const name = stack_text.addText(description)
  name.minimumScaleFactor = 0.3
  name.font = Font.systemFont(10)
  name.lineLimit = 1
  stack.addSpacer(2)
}

function printIncidence(stack, data, data_yesterday) {
  value = data["incidence_7_days"]
  description = data["state_district"]

  const stack_outline = stack.addStack()
  stack_outline.setPadding(0, 0, 0, 0)
  stack_outline.layoutVertically()

  const line = stack_outline.addStack()
  line.setPadding(0, 0, 0, 0)
  line.layoutHorizontally()
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

  const stack_text = stack_outline.addStack()
  stack_text.setPadding(0, 0, 0, 0)
  stack_text.layoutHorizontally()
  const name = stack_text.addText(description)
  name.minimumScaleFactor = 0.3
  name.font = Font.systemFont(10)
  name.lineLimit = 1

  stack.addSpacer(2)
}

function getTrendArrow(preValue, currentValue) {
  return (currentValue <= preValue) ? '↓' : '↑'
}

function saveData(fType, dataId, newData) {
  var path = fm.joinPath(fmConfigDirectory, 'corona-widget-at-' + dataId + fType)
  switch (fType) {
    case fileType.json:
      fm.writeString(path, JSON.stringify(newData))
      break;
    case fileType.csv:
    default:
      fm.writeString(path, newData)
      break;
  }
}

async function loadData(fType, dataId) {
    let path = fm.joinPath(fmConfigDirectory, 'corona-widget-at-' + dataId + fType)
    if (fm.isFileStoredIniCloud(path) && !fm.isFileDownloaded(path)) {
        await fm.downloadFileFromiCloud(path)
    }
    if (fm.fileExists(path)) {
        try {
            let string = fm.readString(path)
            switch (fType) {
              case fileType.json:
                return new DataResponse(JSON.parse(string))
              case fileType.csv:
              default:
                data = string
                return new DataResponse(string)
            }
         } catch (e) {
            log(e)
            return new DataResponse(null, 500)
         }
    }
    return new DataResponse(null, 404)
}


function getFilemanager() {
    try {
        fm = FileManager.iCloud()
    } catch (e) {
        fm = FileManager.local()
    }
    // check if user logged in iCloud
    try { 
        fm.documentsDirectory()
    } catch(e) {
        fm = FileManager.local()
    }
    return fm
}

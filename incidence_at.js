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

const calcMode = {
  none: 0,
  incidence: 1,
  cases: 2,
};

function parseLocation (location) {
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
    } else
    {
      date = fmt.date(matched2[i].match(regex_date)[0]) 
    }
    if (matched2[i].includes("Reproduktionszahl")) {
      name = "R"
    } else if (matched2[i].includes("Neuinfektionen")) {
      name = "Cases"
    }
    tmp = {
        name: name,
        value: parseFloat(matched[i].replace(",",".")),
        date: date,
        }
    matched3.push(tmp)
  }
  return matched3
}

async function createWidget(items) {
  if (!args.widgetParameter) {
    const list = new ListWidget()
    list.setPadding(0,0,0,0)
    //list.addText("GKZ als Parameter definieren.")
    //return list
  }

  //const locations = args.widgetParameter.split(";").map(parseLocation)
  const locations = "802,B;804,FK;803,DO".split(";").map(parseLocation)
  const loc = "10,AT".split(";").map(parseLocation)
  const apidata = await new Request(apiUrl).loadString()
  const apidata_lines = apidata.split("\n").reverse()

  const apidata_Timeline = await new Request(apiUrlTimeline).loadString()
  const apidata_Timeline_lines = apidata_Timeline.split("\n").reverse()

  const regex = /e(\d,?\d*)/gm;
  const regex2 = /(Reproduktionszahl|Neuinfektionen){1} ((heute|gestern)? ?(\d\d\.\d\d\.\d\d\d\d)?(\d\d:\d\d)?)/gm;
  const apidata_r = await new Request(apiRValues).loadString()
  matched3 = getRValues(apidata_r)

  const list = new ListWidget()
  list.setPadding(2,10,2,0)
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
  infected_stack.centerAlignContent()

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
  list.addSpacer(2)

  const header = list.addText("🦠 Incidence " + day_month_formatter.string(data_today["date"]))
  header.font = Font.mediumSystemFont(11)
  list.addSpacer(2)

  const line = list.addStack()
  line.layoutHorizontally()
  line.centerAlignContent()
  line.useDefaultPadding()

  // show incidence for austria
  printIncidence(line, data_today, data_today["name"])

  // show incidence for given districts
  for (location of locations) {
    const data = calc(apidata_lines, location)
    const data_yesterday_2 = calc(apidata_lines, location, 1)
    if (data["error"]) {
      list.addText(data["error"])
      continue
    }
    printIncidence(line, data, data_yesterday_2)
  }

  return list
}

function printIncidence(stack, data, data_yesterday){
    value = data["incidence"]
    description = data["name"]
    const line = stack.addStack()
    line.setPadding(0,0,0,0)
    line.layoutVertically()
    const label = line.addText(String(value) + getTrendArrow(data_yesterday["incidence"], data["incidence"]))
    label.font = Font.boldSystemFont(11)
    label.centerAlignText()

    if(value >= 50) {
      label.textColor = Color.red()
    } else if(value >= 35) {
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

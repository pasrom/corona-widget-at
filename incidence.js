// Lizenz: AGES Dashboard COVID19 AT
// 3-stellige GKZ verwenden (zweite Spalte in https://covid19-dashboard.ages.at/data/CovidFaelle_GKZ.csv).
// Widget Parameter: "204,KFL;312;706" für Klagenfurt Land (angezeigt als KFL), Korneuburg und Landeck
//
// Basiert auf der deutschen Variante von kevinkub (https://gist.github.com/kevinkub/46caebfebc7e26be63403a7f0587f664) und Baumchen (https://gist.github.com/Baumchen/6d91df0a4c76c45b15576db0632e4329).

const apiUrl = "https://covid19-dashboard.ages.at/data/CovidFaelle_GKZ.csv"

function parseLocation (location) {
  const components = location.split(",")
  return {
    gkz: components[0],
    name: components.length >= 2 ? components[1] : null,
  }
}

function dataForLocation(data, location) {
  for (line of data) {
    const components = line.split(";")
    if (components[1] === location["gkz"]) {
      return {
       incidence: Math.round(parseFloat(components[5]) * (100000 / parseFloat(components[2]))),
       name: location["name"] ? location["name"] : components[0],
      }
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

async function createWidget(items) {
  if (!args.widgetParameter) {
    const list = new ListWidget()
    list.addText("GKZ als Parameter definieren.")
    return list
  }

  const locations = args.widgetParameter.split(";").map(parseLocation)
  const apidata = await new Request(apiUrl).loadString()
  const apidata_lines = apidata.split("\n")

  const list = new ListWidget()
  const header = list.addText("🦠 Inzidenz".toUpperCase())
  header.font = Font.mediumSystemFont(13)

  list.addSpacer()

  for (location of locations) {
    const data = dataForLocation(apidata_lines, location)

    if (data["error"]) {
      list.addText(data["error"])
      continue
    }

    const incidence = data["incidence"]
    const cityName = data["name"]

    const line = list.addStack()
    line.layoutHorizontally()
    line.centerAlignContent()
    line.useDefaultPadding()

    const label = line.addText(incidence+"")
    label.font = Font.boldSystemFont(24)
    label.leftAlignText()

    if(incidence >= 50) {
      label.textColor = Color.red()
    } else if(incidence >= 35) {
      label.textColor = Color.orange()
    } else {
      label.textColor = Color.green()
    }

    line.addSpacer()

    const name = line.addText(cityName)
    name.minimumScaleFactor = 0.3
    name.font = Font.caption2()
    name.lineLimit = 1
    name.rightAlignText()
  }

  return list
}

/**
 * Created by mreso_000 on 1/10/14.
 */

// This script is used in the popup HTML that appears when you click the extension popup in the omni-box as appropriate

//When the window loads create the page data to display
window.onload = displayAttendeeInfo;
function displayAttendeeInfo() {
    var attendeeData = chrome.extension.getBackgroundPage().attendeeInfo;
    console.log("Popup attempted to receive data and it received: "+attendeeData);
    if (attendeeData)
        buildAttendeeDataPage(attendeeData);
    else
        buildNotFoundDataPage();
}


// This builds the page body when attendee info is involved
// and calls whatever is needed to facilitate this
function buildAttendeeDataPage(attendeeData) {
    createTable(attendeeData);
  // addButton("badgePickup");
}

// This builds the page body when NO attendee info is involved
// and calls whatever is needed to facilitate this
// TODO make this into something better than a blank page
function buildNotFoundDataPage() {
    console.log("Building table missing attendee");
    var body=document.getElementsByTagName('body')[0];
    var tbl=document.createElement('table');
    tbl.style.width='100%';
    tbl.setAttribute('border','1');
    var tbdy=document.createElement('tbody');
    for(var i=0;i<3;i++){
        var tr=document.createElement('tr');
        for(var j=0;j<2;j++){
            if(i==2 && j==1){
                break
            } else {
                var td=document.createElement('td');
                td.appendChild(document.createTextNode('\u0020'))
                i==1&&j==1?td.setAttribute('rowSpan','2'):null;
                tr.appendChild(td)
            }
        }
        tbdy.appendChild(tr);
    }
    tbl.appendChild(tbdy);
    body.appendChild(tbl)

}

// Makes a table containing attendee data
// Used during POC and generally messy code :-)
// TODO Cleanup or remove this
function createTable(attendeeData) {
    console.log("Building table with attendee data");
    //Build a table
    var body=document.getElementsByTagName('body')[0];
    var tbl=document.createElement('table');
    tbl.style.width='100%';
    tbl.setAttribute('border','1');
    var tbdy=document.createElement('tbody');
    // Make a row for each piece of attendee data
    for(var i=0;i<attendeeData.length;i++){
        console.log("Table element value: "+attendeeData[i]);
        var tr=document.createElement('tr');
        var td=document.createElement('td');
        if (attendeeData[i]==null) {
            td.appendChild(document.createTextNode(chrome.i18n.getMessage("dbValueNotSetErrorMsg")))
        } else {
            td.appendChild(document.createTextNode(attendeeData[i].valueOf()))
        }
        //add the cell
        tr.appendChild(td)
        //add the row
        tbdy.appendChild(tr);
    }
    tbl.appendChild(tbdy);
    body.appendChild(tbl);
    // The table has finished being built




    //Add a button to download a file to print the badge
    //This should really be seperate, but oh well
    var elname = "badgebutton1";
    //var elfunction = doBadgePrintDownload(attendeeData);
    var element = document.createElement("input");
    element.setAttribute("type", "button");
    element.setAttribute("value", chrome.i18n.getMessage("badgePickupButton"));
    element.setAttribute("name", elname);
    element.setAttribute("class", "button");
    body.appendChild(element);


    var el = document.getElementsByName(elname)[0];

    if (el.addEventListener)
        el.addEventListener("click", function() {
            doBadgePrintDownload(attendeeData);
        }, false );
    else if (el.attachEvent)
        el.attachEvent('onclick', function() {
            doBadgePrintDownload(attendeeData);
        });

}

// This is what happens when the button is clicked
// Note the hard coded nature of the information ;-)
function doBadgePrintDownload(attendeeData) {

    var backgroundTif = attendeeData[7] + ".tif";




    var ticketText ="ADULT";
    var badgeBackgroundTif = "ADULT.tif";
    var attendeeBadgeName = "Olaf the Snowman";
    var badgeNumber = "A54871";

    //saveTextAsFile(badgeNumber, attendeeBadgeName, badgeBackgroundTif, ticketText );
    saveTextAsFile(attendeeData[2], attendeeData[6], backgroundTif, attendeeData[4] );

    window.confirm("Badge printed. Window will now close.");
    //window.close();

    // Here we can try to send TCP RAW
    /*
    var socket = chrome.socket;
    var socketInfo;

    socket.create("tcp",{}, function(_socketInfo) {
        socketInfo = _socketInfo;
        socket.connect(socketInfo.socketId,"127.0.0.1",6000, function() {
            socket.write(socketInfo.socketId, "test data send", function() {
                socket.disconnect(socketInfo.socketId, function() {
                    socket.destroy(socketInfo.socketId);
                });
            });
        });
    });
    chrome.socket.destroy(conn);

    //ANOTHER TRY

    chrome.experimental.socket.create('tcp', '127.0.0.1', 8080, function(socketInfo) {
        chrome.experimental.socket.connect(socketInfo.socketId, function (result) {
            chrome.experimental.socket.write(socketInfo.socketId, "Hello, world!");
        });
    });
     */
}

function saveTextAsFile(badgeNumText, badgeNameText, background, tix)
{
    // This is from
    // http://thiscouldbebetter.wordpress.com/2012/12/18/loading-editing-and-saving-a-text-file-in-html5-using-javascrip/

    //var textToWrite = "THIS IS SAMPLE TEXT TO WRITE TO A FILE";
    //var textFileAsBlob = new Blob([textToWrite], {type:'text/plain'});
    var textHeader = '"Badge Type","Badge File BackGround","Badge Number","Badge Name","Workstation ID"';
    var text = new Array();
    text[0] = tix;
    text[1] = background;
    text[2] = badgeNumText;
    text[3] = badgeNameText;

    text[4] = chrome.storage.local.get( "workstationId", function ( items )
                                {
                                    console.log(items.workstationId);
                                } );

    var textToWrite = convertArrayToCSVBlob(text, textHeader);
    var textFileAsBlob = new Blob([textToWrite], {type:'text/csv'});
    //This makes sure bogus characters will not screw up the filename
    var desiredNameText = badgeNameText.replace(/[^\w\s]/gi, '');
    var fileNameToSaveAs = badgeNumText +" - "+ desiredNameText +".csv";

    //This is the magic that actually downloads the file generated
    var downloadLink = document.createElement("a");
    downloadLink.download = fileNameToSaveAs;
    downloadLink.innerHTML = "Download File";
    if (window.webkitURL != null)
    {
        // Chrome allows the link to be clicked
        // without actually adding it to the DOM.
        downloadLink.href = window.webkitURL.createObjectURL(textFileAsBlob);
    }
    else
    {
        // Firefox requires the link to be added to the DOM
        // before it can be clicked.
        downloadLink.href = window.URL.createObjectURL(textFileAsBlob);
        downloadLink.onclick = destroyClickedElement;
        downloadLink.style.display = "none";
        document.body.appendChild(downloadLink);
    }
    downloadLink.click();
}

// This makes an array into a set of double quoted comma delimited text
// Which is used in comma delimited files
function convertArrayToCSVBlob(arrayToConvert, textHeader) {
    var str = "";
    str = textHeader + "\n";
    for (var i = 0; i < arrayToConvert.length - 1; i++) {
        var line = '';
        line += '"' + arrayToConvert[i] + '",';
        line.slice(0,line.Length-1);
        str += line;
    }
    str += '"' + arrayToConvert[arrayToConvert.length - 1] +'"';
    str += "\n";
    return str;
}





















// TODO FIX or remove
// This puts the badge printing button on the form for use.
function addButton(buttonName) {
    var td = document.getElementsByName('cancel')[0].parentNode;
    var element = document.createElement("input");
    element.setAttribute("type", "button");
    switch (buttonName) {
        case "badgePickup":
            element.setAttribute("value", "Badge Pick Up");
            var elname = "badgebutton1";
            var elfunction = doBadgePrint;
            break;
        case "badgeLost":
            element.setAttribute("value", "Badge Lost / Issue Replacement");
            var elname = "badgelostbutton1";
            var elfunction = doBadgeReissue;
            break;
    }
    element.setAttribute("name", elname);
    element.setAttribute("class", "button");
    td.appendChild(element);
    var el = document.getElementsByName(elname)[0];
    if (el.addEventListener)
        el.addEventListener("click", elfunction, false );
    else if (el.attachEvent)
        el.attachEvent('onclick', elfunction);
}
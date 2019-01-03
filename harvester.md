# Harvester Script

Go to [this site](https://mnm.social/instances) and run this in the browser console.

```javascript
var AA = [];
var AB = 1;
function goRun () {
  $.get(`https://mnm.social/instances/?page=${AB}`, function(data) {
  var AC = AA;
  var AD = $('.ui.celled.table tr > td:nth-child(1) a', $.parseHTML(data)).toArray().map((el) => { return (new URL($(el).attr('href'))).host });
  AA = AC.concat(AD);
  console.log(AB);
  AB++;
  goRun();
  });
}
goRun()
```

After that, run `JSON.stringify(AA)` and click the copy button to paste into the servers list.

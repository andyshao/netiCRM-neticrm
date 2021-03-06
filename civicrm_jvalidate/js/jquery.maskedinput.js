/*
  Masked Input plugin for jQuery
  Copyright (c) 2007-2013 Josh Bush (digitalbush.com)
  Licensed under the MIT license (http://digitalbush.com/projects/masked-input-plugin/#license)
  Version: 1.3.1
*/

(function($) {
  function getPasteEvent() {
    var el = document.createElement('input'),
        name = 'onpaste';
    el.setAttribute(name, '');
    return (typeof el[name] === 'function')?'paste':'input';             
}

var pasteEventName = getPasteEvent() + ".amask",
  ua = navigator.userAgent,
  iPhone = /iphone/i.test(ua),
  android=/android/i.test(ua),
  caretTimeoutId;

$.amask = {
  //Predefined character definitions
  definitions: {
    '9': "[0-9]",
    'a': "[A-Za-z]",
    '*': "[A-Za-z0-9]"
  },
  dataName: "arawMaskFn",
  placeholder: '_',
};

$.fn.extend({
  //Helper Function for Caret positioning
  caret: function(begin, end) {
    var range;

    if (this.length === 0 || this.is(":hidden")) {
      return;
    }

    if (typeof begin == 'number') {
      end = (typeof end === 'number') ? end : begin;
      return this.each(function() {
        if (this.setSelectionRange) {
          this.setSelectionRange(begin, end);
        } else if (this.createTextRange) {
          range = this.createTextRange();
          range.collapse(true);
          range.moveEnd('character', end);
          range.moveStart('character', begin);
          range.select();
        }
      });
    } else {
      if (this[0].setSelectionRange) {
        begin = this[0].selectionStart;
        end = this[0].selectionEnd;
      } else if (document.selection && document.selection.createRange) {
        range = document.selection.createRange();
        begin = 0 - range.duplicate().moveStart('character', -100000);
        end = begin + range.text.length;
      }
      return { begin: begin, end: end };
    }
  },
  unmask: function() {
    return this.trigger("unmask");
  },
  amask: function(amask, settings) {
    var input,
      inputWrapper,
      defs,
      tests,
      partialPosition,
      firstNonMaskPos,
      len,
      keyIsPress,
      keyIsInput,
      keyBackAndroid,
      preventDoubleInput = 0,
      isIME;

    var jvalidateSetting = Drupal.settings.jvalidate;
    var imeCompositionEnabled = false;
    var imeKeydownEnabled = false;
    var imeNotifyMsg = jvalidateSetting.imeNotify;
    var isFirefox = typeof InstallTrigger !== 'undefined';
    var isPasteEvent = false;

    if (!amask && this.length > 0) {
      input = $(this[0]);
      return input.data($.amask.dataName)();
    }
    settings = $.extend({
      placeholder: $.amask.placeholder, // Load default placeholder
      completed: null
    }, settings);


    defs = $.amask.definitions;
    tests = [];
    partialPosition = len = amask.length;
    firstNonMaskPos = null;

    $.each(amask.split(""), function(i, c) {
      if (c == '?') {
        len--;
        partialPosition = i;
      } else if (defs[c]) {
        tests.push(new RegExp(defs[c]));
        if (firstNonMaskPos === null) {
          firstNonMaskPos = tests.length - 1;
        }
      } else {
        tests.push(null);
      }
    });

    return this.trigger("unmask").each(function() {
      var input = $(this),
        inputWrapper = input.closest(".crm-form-elem"),
        buffer = $.map(
        amask.split(""),
        function(c, i) {
          if (c != '?') {
            return defs[c] ? settings.placeholder : c;
          }
        }),
        focusText = input.val();

      function getKeyCode(str, idx){
        if (typeof idx == 'undefined') {
          idx = str.indexOf(settings.placeholder);
        }
        if (idx >= 0) {
          str = str.substr(0, idx);
        }
        return str.charCodeAt(str.length - 1);
      }

      function seekNext(pos) {
        while (++pos < len && !tests[pos]);
        return pos;
      }

      function seekPrev(pos) {
        while (--pos >= 0 && !tests[pos]);
        return pos;
      }

      function shiftL(begin,end) {
        var i,
          j;

        if (begin<0) {
          return;
        }

        for (i = begin, j = seekNext(end); i < len; i++) {
          if (tests[i]) {
            if (j < len && tests[i].test(buffer[j])) {
              buffer[i] = buffer[j];
              buffer[j] = settings.placeholder;
            } else {
              break;
            }

            j = seekNext(j);
          }
        }
        writeBuffer();
        input.caret(Math.max(firstNonMaskPos, begin));
      }

      function shiftR(pos) {
        var i,
          c,
          j,
          t;

        for (i = pos, c = settings.placeholder; i < len; i++) {
          if (tests[i]) {
            j = seekNext(i);
            t = buffer[i];
            buffer[i] = c;
            if (j < len && tests[j].test(t)) {
              c = t;
            } else {
              break;
            }
          }
        }
      }

      function keydownEvent(e) {
        var k = e.which,
          pos,
          begin,
          end;
        keyIsPress = false;
        isIME = false;
        pos = input.caret();
        keyBackAndroid = pos.end;

        var specialkeys = [8, 9, 18, 20, 27, 32, 33, 34, 35, 36, 37, 38, 39, 40, 45, 46];

        //backspace, delete, and escape get special treatment
        if (k === 8 || k === 46 || (iPhone && k === 127)) {
          pos = input.caret();
          begin = pos.begin;
          end = pos.end;

          if (end - begin === 0) {
            begin=k!==46?seekPrev(begin):(end=seekNext(begin-1));
            end=k===46?seekNext(end):end;
          }
          clearBuffer(begin, end);
          shiftL(begin, end - 1);

          e.preventDefault();
        } else if (k == 27) {//escape
          input.val(focusText);
          input.caret(0, checkVal());
          e.preventDefault();
        } else if (k == 229) { // ime
          isIME = true;
          imeKeydownEnabled = true;
        }

        if (k != 229 && specialkeys.indexOf(k) == -1) {
          imeKeydownEnabled = false;
        }

        if (imeKeydownEnabled) {
          addImeNotify(inputWrapper);

          if (!android && (k != 37 && k != 39)) {
            e.preventDefault();
            return;
          }
        }
        else {
          removeImeNotify(inputWrapper);

          if (imeCompositionEnabled) {
            imeCompositionEnabled = false;
          }
        }
      }

      function keypressEvent(e) {
        var k = e.which,
          pos,
          p,
          c,
          next;
        keyIsPress = true;

        if (e.ctrlKey || e.altKey || e.metaKey || k < 32) {//Ignore
          return;
        } else if (k) {
          pos = input.caret();
          if (pos.end - pos.begin !== 0){
            clearBuffer(pos.begin, pos.end);
            shiftL(pos.begin, pos.end-1);
          }

          p = seekNext(pos.begin - 1);
          if (p < len) {
            c = String.fromCharCode(k);
            if (tests[p].test(c)) {
              shiftR(p);

              buffer[p] = c;
              writeBuffer();
              next = seekNext(p);

              if(android){
                setTimeout(function(){input.caret(next);},0);
              }else{
                input.caret(next);
              }

              if (settings.completed && next >= len) {
                settings.completed.call(input);
              }
            }
          }
          e.preventDefault();
        }
      }

      function keyInput(e) {
        // workaround for firefox
        if (typeof e.timeStamp !== 'undefined' && typeof InstallTrigger !== 'undefined') {
          if (preventDoubleInput !== 0) {
            var different = e.timeStamp - preventDoubleInput;
            if (different <= 3) {
              preventDoubleInput = e.timeStamp;
              return;
            }
          }
          preventDoubleInput = e.timeStamp;
        }
        // fallback when no keypress
        keyIsInput = true;
        if (keyIsPress) {
          keyIsPress = false;
          return;
        }
        var currentInput = this.value,
          k,
          pos,
          p,
          c,
          next;
        
        pos = input.caret();
        pos.end--;
        pos.begin--;
        if (pos.end - pos.begin !== 0){
          clearBuffer(pos.begin, pos.end);
          shiftL(pos.begin, pos.end-1);
        }

        p = seekNext(pos.begin - 1);
        if (p < len) {
          if (android) {
            if(pos.end+1 > keyBackAndroid) {
              if (!isPasteEvent) {
                k = getKeyCode(this.value, pos.end+1);
                c = String.fromCharCode(k);
              }
            }
            else {
              // backspace handling of android
              var begin = pos.begin + 1;
              var end = pos.end + 1;

              if (end - begin === 0) {
                begin = seekNext(begin-1);
                end = end;
              }

              clearBuffer(begin, end);
              if (begin > end) {
                end--;
                begin = end;
              }
              shiftL(begin, end - 1);
              return;
            }
          }
          else {
            if (!isPasteEvent) {
              k = getKeyCode(this.value, pos.end+1);
              c = String.fromCharCode(k);
            }
          }

          if (!isPasteEvent) {
            if (tests[p].test(c)) {
              shiftR(p);
              buffer[p] = c;
              writeBuffer();
              next = seekNext(p);
              input.caret(next);

              if (settings.completed && next >= len) {
                settings.completed.call(input);
              }
            }
          }
        }
        else {
          shiftL(pos.begin, pos.end);
        }
        keyIsPress = false;

        if (isFirefox) {
          if (imeCompositionEnabled) {
            addImeNotify(inputWrapper);
          }
          else {
            removeImeNotify(inputWrapper);
          }
        }
      }

      function clearBuffer(start, end) {
        var i;
        for (i = start; i < end && i < len; i++) {
          if (tests[i]) {
            buffer[i] = settings.placeholder;
          }
        }
      }

      function writeBuffer() {
        input.val(buffer.join(''));
      }

      function checkVal(allow) {
        //try to place characters where they belong
        var test = input.val(),
          lastMatch = -1,
          i,
          c;

        for (i = 0, pos = 0; i < len; i++) {
          if (tests[i]) {
            buffer[i] = settings.placeholder;
            while (pos++ < test.length) {
              c = test.charAt(pos - 1);
              if (tests[i].test(c)) {
                buffer[i] = c;
                lastMatch = i;
                break;
              }
            }
            if (pos > test.length) {
              break;
            }
          } else if (buffer[i] === test.charAt(pos) && i !== partialPosition) {
            pos++;
            lastMatch = i;
          }
        }
        if (allow) {
          writeBuffer();
        }
        else {
          writeBuffer();
          input.val(input.val().substring(0, lastMatch + 1));
        }
        return (partialPosition ? i : firstNonMaskPos);
      }

      function addImeNotify(elem) {
        if (elem.find(".ime-notify").length == 0) {
          elem.append("<div class='messages warning ime-notify'>" + imeNotifyMsg + "</div>");
        }
      }

      function removeImeNotify(elem) {
        if (elem.find(".ime-notify").length > 0) {
          elem.find(".ime-notify").remove();
        }
      }

      input.data($.amask.dataName,function(){
        return $.map(buffer, function(c, i) {
          return tests[i]&&c!=settings.placeholder ? c : null;
        }).join('');
      });

      if (!input.attr("readonly"))
        input
        .one("unmask", function() {
          input
            .unbind(".amask")
            .unbind("input")
            .removeData($.amask.dataName);
        })
        .bind("compositionstart.amask", function() {
          imeCompositionEnabled = true;
        })
        .bind("focus.amask", function() {
          clearTimeout(caretTimeoutId);
          var pos,
            moveCaret;

          focusText = input.val();
          pos = checkVal();
          
          caretTimeoutId = setTimeout(function(){
            writeBuffer();
            if (pos == amask.length) {
              input.caret(0, pos);
            } else {
              input.caret(pos);
            }
          }, 10);
        })
        .bind("blur.amask", function() {
          checkVal();
          if (input.val() != focusText) {
            input.change();
          }

          removeImeNotify(inputWrapper);
        })
        .bind("keydown.amask", keydownEvent)
        .bind("keypress.amask", keypressEvent)
        .bind("input", keyInput)
        .bind(pasteEventName, function() {
          isPasteEvent = true;

          setTimeout(function() { 
            var pos=checkVal(true);
            input.caret(pos); 
            if (settings.completed && pos == input.val().length)
              settings.completed.call(input);
          }, 0);
        });
      checkVal(); //Perform initial check for existing values
    });
  }
});


})(jQuery);

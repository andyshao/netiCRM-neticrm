/*
 * 本著作係依據創用 CC 姓名標示-相同方式分享 2.5 台灣 授權條款進行授權。
 * 如欲瀏覽本授權條款之副本，請造訪 http://creativecommons.org/licenses/by-sa/2.5/tw/
 * 或寄信至 Creative Commons, 171 Second Street, Suite 300, San Francisco, California, 94105, USA。
 *
 * This work is licensed under the Creative Commons Attribution-Share Alike 2.5 Taiwan License.
 * To view a copy of this license, visit http://creativecommons.org/licenses/by-sa/2.5/tw/
 * or send a letter to Creative Commons, 171 Second Street, Suite 300, San Francisco, California, 94105, USA.
 *
 * 台灣郵遞區號外掛 / Taiwan Zip Code Plugin of jQuery
 * http://app.essoduke.org/twzipcode/
 *
 * version 1.3:
 *  #新增輸入郵遞區號取得縣市名稱的功能。（意見提供：ileadu）
 *
 * version 1.2:
 *  #修正 IE6 鄉鎮市區選單只顯示一個以及清單過長的問題
 *
 * version 1.1:
 *  #修正 form reset 時，鄉鎮市區選單無法重置的錯誤
 *  #加入css參數以套用樣式： $(element).twzipcode({ css:[select1, select2, select3] });
 *  #改寫成更簡潔的源碼以增進效能
 *  #使用自訂表單元件名稱
 *
 * Wed, 25 August 2010 10:58:54 GMT
 */
;(function($) {

  $.fn.extend({

    twzipcode: function(options) {
      var dbcode = { "南投縣": "4855", "台中市": "5219", "台北市": "5221", "台南市": "5224", "台東縣": "4861", "嘉義市": "5222", "嘉義縣": "4849", "基隆市": "4864", "宜蘭縣": "4852", "屏東縣": "4857", "彰化縣": "4848", "新北市": "4860", "新竹市": "5223", "新竹縣": "4850", "桃園市": "4862", "澎湖縣": "4856", "花蓮縣": "4851", "苗栗縣": "4854", "連江縣": "5225", "金門縣": "5226", "雲林縣": "4863", "高雄市": "5220" };

      var o = jQuery.extend({
        countyName: '',
        areaName: '',
        zipName: '',
        countySel: '',
        areaSel: '',
        zipSel: '',
        zipReadonly: true,
        dbcode: '',
        css: []
      }, options);

      if(o.dbcode){
        dbcode = o.dbcode;
      }

      var _ = $(this);
      var sel = {}, zipcode = $.fn.twzipcode.zipcode;
      var i = 0, tpl = [];
      var opt = ['<option value="">-- 縣市 --</option>', '<option value="">-- 鄉鎮市區 --</option>'];
      var ie = false;
      if(typeof $.browser !== 'undefined') {
        if($.browser.msie && $.browser.version.substr(0,1) == '6'){
          ie = true;
        }
      }
      
      try {
        sel.county = ( o.countyName ) ? ( $('select[name="' + o.countyName + '"]').length > 0 ? $('select[name="' + o.countyName + '"]') : _.append('<select name="' + o.countyName + '[]" />').children('select:eq(0)') ) : _.append('<select name="zip_county[]" />').children('select:eq(0)');
        sel.area = ( o.areaName ) ? ( $('select[name="' + o.areaName + '"]').length > 0 ? $('select[name="' + o.areaName + '"]') : _.append('<select name="' + o.areaName + '[]" />').children('select:eq(1)') ) : _.append('<select name="zip_area[]" />').children('select:eq(1)');
        sel.zip  = ( o.zipName ) ? ( $('input[name="' + o.zipName + '"]').length > 0 ? $('input[name="' + o.zipName + '"]') : _.append('<input type="text" name="' + o.zipName + '[]" />').children('input:eq(0)') ) : _.append('<input type="text" name="zip_code[]" />').children('input:eq(0)');
      }
      catch(e){}

      sel.county.addClass( o.css && o.css[0] === 'undefined' ? '' : o.css[0] );
      sel.area.addClass( o.css && o.css[1] === 'undefined' ? '' : o.css[1] );
      sel.zip.addClass( o.css && o.css[2] === 'undefined' ? '' : o.css[2] );
      sel.zip.attr('readonly', o.zipReadonly);
      sel.county.empty().append( opt[0] );

      for( var data in zipcode ){
        if( dbcode[data] ){
          tpl[i++] = '<option value="';
          tpl[i++] = dbcode[data];
          tpl[i++] = '">';
          tpl[i++] = data;
          tpl[i++] = '</option>';
        }
      }
      
      sel.county.append( tpl.join('') ).val( dbcode[o.countySel] );
      sel.county.attr('selected', true);
      sel.county.change(function(){
        i = 0;
        tpl = [];
        if(sel.county.val() == ''){
          sel.area.empty().append( opt[1] ).trigger('change');
          sel.zip.val('');
        }
        else {
          for( var data in zipcode[ sel.county.children("option:selected").text() ] ){
            if( data ){
              tpl[i++] = '<option value="';
              tpl[i++] = data;
              tpl[i++] = '">';
              tpl[i++] = data;
              tpl[i++] = '</option>';
            }
          }
          if(ie){
            var ie6 = $(sel.area)[0];
            ie6.options.length = parseInt((i/5), 10);
          }
          sel.area.empty().append( tpl.join('') ).val( o.areaSel );
          sel.area.attr('selected', true).trigger('change');
        }
      });

      sel.area.change(function(){
        if(sel.area.val() !== ''){
          var county = sel.county.children("option:selected").text();
          if($(this).val()){
            if( zipcode[county][$(this).val()] ){
              sel.zip.val( zipcode[ sel.county.children("option:selected").text() ][ $(this).val() ] );
            }
          }
        }
      });

      sel.county.val( dbcode[o.countySel] );
      sel.county.attr('selected', true);
      sel.county.trigger('change');
      
      
      $('input[type=reset]').click(function(){ sel.area.empty().append( opt[1] ); });
    }
    
  });

  /*
   * enter the zipcode to find the county and area
   * Wed, 25 August 2010 10:22:12 GMT
   */
  $.fn.twzipcode.fromzip = function(sel){

      var result = [];
      var zipcode = $.fn.twzipcode.zipcode;
      
      for(var i in zipcode){
        
        for(var j in zipcode[i]){
          if(sel == zipcode[i][j]){
            result.push(i);
            result.push(j);
            break;
          }
        }
      }
      
      return result;
      
  };
    
  $.fn.twzipcode.zipcode = {
    '基隆市': {'仁愛區':'200', '信義區':'201', '中正區':'202', '中山區':'203', '安樂區':'204', '暖暖區':'205', '七堵區':'206'},
    '台北市': {'中正區':'100', '大同區':'103', '中山區':'104', '松山區':'105', '大安區':'106', '萬華區':'108', '信義區':'110', '士林區':'111', '北投區':'112', '內湖區':'114', '南港區':'115', '文山區':'116'},
    '新北市': {
      '萬里區':'207', '金山區':'208', '板橋區':'220', '汐止區':'221', '深坑區':'222', '石碇區':'223',
      '瑞芳區':'224', '平溪區':'226', '雙溪區':'227', '貢寮區':'228', '新店區':'231', '坪林區':'232',
      '烏來區':'233', '永和區':'234', '中和區':'235', '土城區':'236', '三峽區':'237', '樹林區':'238',
      '鶯歌區':'239', '三重區':'241', '新莊區':'242', '泰山區':'243', '林口區':'244', '蘆洲區':'247',
      '五股區':'248', '八里區':'249', '淡水區':'251', '三芝區':'252', '石門區':'253'
    },
    '宜蘭縣': {
      '宜蘭市':'260', '頭城鎮':'261', '礁溪鄉':'262', '壯圍鄉':'263', '員山鄉':'264', '羅東鎮':'265',
      '三星鄉':'266', '大同鄉':'267', '五結鄉':'268', '冬山鄉':'269', '蘇澳鎮':'270', '南澳鄉':'272',
      '釣魚台列嶼':'290'
    },
    '新竹市': {'東區':'300', '北區':'300', '香山區':'300'},
    '新竹縣': {
      '竹北市':'302', '湖口鄉':'303', '新豐鄉':'304', '新埔鎮':'305', '關西鎮':'306', '芎林鄉':'307',
      '寶山鄉':'308', '竹東鎮':'310', '五峰鄉':'311', '橫山鄉':'312', '尖石鄉':'313', '北埔鄉':'314',
      '峨嵋鄉':'315'
    },
    '桃園市': {
      '中壢區':'320', '平鎮區':'324', '龍潭區':'325', '楊梅區':'326', '新屋區':'327', '觀音區':'328',
      '桃園區':'330', '龜山區':'333', '八德區':'334', '大溪區':'335', '復興區':'336', '大園區':'337',
      '蘆竹區':'338'
    },
    '苗栗縣': {
      '竹南鎮':'350', '頭份鎮':'351', '三灣鄉':'352', '南庄鄉':'353', '獅潭鄉':'354', '後龍鎮':'356',
      '通霄鎮':'357', '苑裡鎮':'358', '苗栗市':'360', '造橋鄉':'361', '頭屋鄉':'362', '公館鄉':'363',
      '大湖鄉':'364', '泰安鄉':'365', '銅鑼鄉':'366', '三義鄉':'367', '西湖鄉':'368', '卓蘭鎮':'369'
    },
    '台中市': {'中區':'400', '東區':'401', '南區':'402', '西區':'403', '北區':'404', '北屯區':'406',
      '西屯區':'407', '南屯區':'408',
      '太平區':'411', '大里區':'412', '霧峰區':'413', '烏日區':'414', '豐原區':'420', '后里區':'421',
      '石岡區':'422', '東勢區':'423', '和平區':'424', '新社區':'426', '潭子區':'427', '大雅區':'428',
      '神岡區':'429', '大肚區':'432', '沙鹿區':'433', '龍井區':'434', '梧棲區':'435', '清水區':'436',
      '大甲區':'437', '外埔區':'438', '大安區':'439'
    },
    '彰化縣': {
      '彰化市':'500', '芬園鄉':'502', '花壇鄉':'503', '秀水鄉':'504', '鹿港鎮':'505', '福興鄉':'506',
      '線西鄉':'507', '和美鎮':'508', '伸港鄉':'509', '員林鎮':'510', '社頭鄉':'511', '永靖鄉':'512',
      '埔心鄉':'513', '溪湖鎮':'514', '大村鄉':'515', '埔鹽鄉':'516', '田中鎮':'520', '北斗鎮':'521',
      '田尾鄉':'522', '埤頭鄉':'523', '溪州鄉':'524', '竹塘鄉':'525', '二林鎮':'526', '大城鄉':'527',
      '芳苑鄉':'528', '二水鄉':'530'
    },
    '南投縣': {
      '南投市':'540', '中寮鄉':'541', '草屯鎮':'542', '國姓鄉':'544', '埔里鎮':'545', '仁愛鄉':'546',
      '名間鄉':'551', '集集鎮':'552', '水里鄉':'553', '魚池鄉':'555', '信義鄉':'556', '竹山鎮':'557',
      '鹿谷鄉':'558'
    },
    '嘉義市': {'東區':'600', '西區':'600'},
    '嘉義縣': {
      '番路鄉':'602', '梅山鄉':'603', '竹崎鄉':'604', '阿里山':'605', '中埔鄉':'606', '大埔鄉':'607',
      '水上鄉':'608', '鹿草鄉':'611', '太保市':'612', '朴子市':'613', '東石鄉':'614', '六腳鄉':'615',
      '新港鄉':'616', '民雄鄉':'621', '大林鎮':'622', '溪口鄉':'623', '義竹鄉':'624', '布袋鎮':'625'
    },
    '雲林縣': {
      '斗南鎮':'630', '大埤鄉':'631', '虎尾鎮':'632', '土庫鎮':'633', '褒忠鄉':'634', '東勢鄉':'635',
      '臺西鄉':'636', '崙背鄉':'637', '麥寮鄉':'638', '斗六市':'640', '林內鄉':'643', '古坑鄉':'646',
      '莿桐鄉':'647', '西螺鎮':'648', '二崙鄉':'649', '北港鎮':'651', '水林鄉':'652', '口湖鄉':'653',
      '四湖鄉':'654', '元長鄉':'655'
    },
    '台南市': {'中西區':'700', '東區':'701', '南區':'702', '北區':'704', '安平區':'708', '安南區':'709',
      '永康區':'710', '歸仁區':'711', '新化區':'712', '左區區':'713', '玉井區':'714', '楠西區':'715',
      '南化區':'716', '仁德區':'717', '關廟區':'718', '龍崎區':'719', '官田區':'720', '麻豆區':'721',
      '佳里區':'722', '西港區':'723', '七股區':'724', '將軍區':'725', '學甲區':'726', '北門區':'727',
      '新營區':'730', '後壁區':'731', '白河區':'732', '東山區':'733', '六甲區':'734', '下營區':'735',
      '柳營區':'736', '鹽水區':'737', '善化區':'741', '大內區':'742', '山上區':'743', '新市區':'744',
      '安定區':'745'
    },
    '高雄市': {
      '新興區':'800', '前金區':'801', '苓雅區':'802', '鹽埕區':'803', '鼓山區':'804', '旗津區':'805',
      '前鎮區':'806', '三民區':'807', '楠梓區':'811', '小港區':'812', '左營區':'813',
      '仁武區':'814', '大社區':'815', '岡山區':'820', '路竹區':'821', '阿蓮區':'822', '田寮區':'823',
      '燕巢區':'824', '橋頭區':'825', '梓官區':'826', '彌陀區':'827', '永安區':'828', '湖內區':'829',
      '鳳山區':'830', '大寮區':'831', '林園區':'832', '鳥松區':'833', '大樹區':'840', '旗山區':'842',
      '美濃區':'843', '六龜區':'844', '內門區':'845', '杉林區':'846', '甲仙區':'847', '桃源區':'848',
      '那瑪夏區':'849', '茂林區':'851', '茄萣區':'852'
    },
    '屏東縣': {
      '屏東市':'900', '三地門':'901', '霧臺鄉':'902', '瑪家鄉':'903', '九如鄉':'904', '里港鄉':'905',
      '高樹鄉':'906', '鹽埔鄉':'907', '長治鄉':'908', '麟洛鄉':'909', '竹田鄉':'911', '內埔鄉':'912',
      '萬丹鄉':'913', '潮州鎮':'920', '泰武鄉':'921', '來義鄉':'922', '萬巒鄉':'923', '崁頂鄉':'924',
      '新埤鄉':'925', '南州鄉':'926', '林邊鄉':'927', '東港鎮':'928', '琉球鄉':'929', '佳冬鄉':'931',
      '新園鄉':'932', '枋寮鄉':'940', '枋山鄉':'941', '春日鄉':'942', '獅子鄉':'943', '車城鄉':'944',
      '牡丹鄉':'945', '恆春鎮':'946', '滿州鄉':'947'
    },
    '台東縣': {
      '臺東市':'950', '綠島鄉':'951', '蘭嶼鄉':'952', '延平鄉':'953', '卑南鄉':'954', '鹿野鄉':'955',
      '關山鎮':'956', '海端鄉':'957', '池上鄉':'958', '東河鄉':'959', '成功鎮':'961', '長濱鄉':'962',
      '太麻里鄉':'963', '金峰鄉':'964', '大武鄉':'965', '達仁鄉':'966'
    },
    '花蓮縣': {
      '花蓮市':'970', '新城鄉':'971', '秀林鄉':'972', '吉安鄉':'973', '壽豐鄉':'974', '鳳林鎮':'975',
      '光復鄉':'976', '豐濱鄉':'977', '瑞穗鄉':'978', '萬榮鄉':'979', '玉里鎮':'981', '卓溪鄉':'982',
      '富里鄉':'983'
    },
    '金門縣': {'金沙鎮':'890', '金湖鎮':'891', '金寧鄉':'892', '金城鎮':'893', '烈嶼鄉':'894', '烏坵鄉':'896'},
    '連江縣': {'南竿鄉':'209', '北竿鄉':'210', '莒光鄉':'211', '東引鄉':'212'},
    '澎湖縣': {'馬公市':'880', '西嶼鄉':'881', '望安鄉':'882', '七美鄉':'883', '白沙鄉':'884', '湖西鄉':'885'}
//    '南海諸島': {'東沙':'817', '南沙':'819'}
  };
})(jQuery);

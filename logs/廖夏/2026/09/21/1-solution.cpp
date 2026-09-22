#include<iostream>
#include<algorithm>
using namespace std;
typedef long long ll;
int main(){
    ll t; cin >> t;
    while(t--){
        ll a, b, c;
        cin >> a >> b >> c;
        bool is_A = true;
        ll tA=-1,tB=-1;
        while(c){
            if(!tA&&!tB)break;
            if (a < b) {
                if (is_A){
                    if(abs(a+c-b)>b-a) {a+=c;tA=c;break;}
                    else tA=0;  
                }
                else tB=0;
            }
            else if(a > b){
                if (is_A){
                    a+=c;tA=c;break;
                }
                else{
                    if (c > a-b){tB=a-b;c-=a-b;}
                    else {b+=c;tB=c;c=0;break;}
                }
            }
            else{// a=b
                if(is_A){a+=c;tA=c;break;}
                else {tB=0;}
            }
            is_A=!is_A;
        }
        cout << abs(a-b) << endl;
    }
    return 0;
}
#include<iostream>
#include<algorithm>
#include<string>
using namespace std;
string s;
int main(){
    int t; cin >> t;
    while(t--){
        int n;
        cin >> n;
        cin >> s;
        int zero[200000], one[200000];
        one[0] = s[0]=='1'?1:0;
        zero[0] = s[0] == '0'?1:0;
        for (int i = 1; i < s.length();i++){
            if (s[i] == '1') one[i] = one[i-1]+1, zero[i] = zero[i-1];
            else zero[i]=zero[i-1]+1, one[i]=one[i-1];
        }
        if (s[0]=='1'){
            int cost = 0;
            for (int i = 0; i < s.length();i++)
                if (s[i] != '1') cost++;
            cout << cost << endl;
        }
        else {
            int cost = n;
            for (int i = 1; i <= s.length();i++){
                cost = min(cost,one[i-1]+zero[s.length()-1]-zero[i-1]);
            }
            cout << cost << endl;
        }
    }
}
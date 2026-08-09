#include <bits/stdc++.h>
using namespace std;

int main() {
    string a;
    cin>>a;
    int cnt[10]={0};
    for(char ch:a)
    {
        cnt[ch-'0']++;
    }
    for(int i=0;i<10;i++)
    {
        if(cnt[i]!=0)
        cout<<i<<':'<<cnt[i]<<endl;
    }
}
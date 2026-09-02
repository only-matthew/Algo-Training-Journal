#include<cstdio>
#include<algorithm>
#include<string>
#include<iostream>
int n;
std::string a[25];
bool cmp(std::string a,std::string b){
    return a+b>b+a;
}
int main(){
    scanf("%d",&n);
    for(int i=0;i<n;i++){
    	std::cin>>a[i];
    }
    std::sort(a,a+n,cmp);
    for(int i=0;i<n;i++){
    	std::cout<<a[i];
    }
}